import AppKit
import Foundation
import UniformTypeIdentifiers

// This records file type resolution and the effective Open With application.
// It does not invoke Quick Look or inspect Finder's selected provider.
struct FileObservation: Codable {
    let contentType: String?
    let extensionTypes: [String]
    let defaultApplication: String?
    let matchingPreviewTypes: [String]
    let expectedPreviewType: String?
}

func require(_ condition: Bool, _ message: String) throws {
    if !condition {
        throw NSError(domain: "Quick Look registration probe", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: message])
    }
}

func propertyList(_ url: URL) throws -> [String: Any] {
    let data = try Data(contentsOf: url)
    return try PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] ?? [:]
}

let tomlPreviewTypes: Set<String> = ["public.toml", "com.markwriter.toml-source"]

let expectedScriptTypes = [
    "example.ps1": "com.microsoft.powershell-script",
    "example.bat": "com.microsoft.batch-file",
]

let fixtures = [
    "example.md": "# Markdown\n",
    "example.markdown": "# Markdown\n",
    "example.mdown": "# Markdown\n",
    "example.mkd": "# Markdown\n",
    "example.json": "{\"key\":true}\n",
    "example.jsonb": "{\"key\":true}\n",
    "example.jsonl": "{\"key\":true}\n",
    "example.ndjson": "{\"key\":true}\n",
    "example.xml": "<example>value</example>",
    "example.yaml": "key: true\n",
    "example.yml": "key: true\n",
    "example.sh": "#!/bin/sh\nprintf hello\n",
    "example.bash": "#!/bin/bash\nprintf hello\n",
    "example.py": "value = True\n",
    "example.sql": "SELECT 1;\n",
    "example.toml": "key = true\n",
    "example.mk": "all:\n\t@true\n",
    "example.mak": "all:\n\t@true\n",
    "Makefile": "all:\n\t@true\n",
    "GNUmakefile": "all:\n\t@true\n",
    "example.h": "typedef unsigned int Fixture;\n",
    "example.cpp": "constexpr int value = 1;\n",
    "example.js": "const value = true;\n",
    "example.mjs": "export const value = true;\n",
    "example.tsx": "const node = <span>Fixture</span>;\n",
    "example.ts": "const value: boolean = true;\n",
    "example.css": "span { color: black; }\n",
    "Dockerfile": "FROM scratch\n",
    ".dockerignore": "**/tmp\n",
    ".gitignore": "**/tmp\n",
    "example.ps1": "Write-Output 'fixture'\n",
    "example.bat": "@echo off\r\necho fixture\r\n",
    "example.cmd": "@echo off\r\necho fixture\r\n",
    "example.psm1": "function Get-Fixture { 'fixture' }\n",
    "example.psd1": "@{ RootModule = 'example.psm1' }\n",
    "example.spec": "Name: fixture\nVersion: 1\n",
    "example.lock": "unrecognized lock content\n",
    "flake.lock": "{\"version\":7,\"root\":\"root\",\"nodes\":{\"root\":{}}}\n",
    "uv.lock": "version = 1\nrevision = 1\n[[package]]\nname = \"fixture\"\n",
    "example.txt": "Plain text\n",
    "example.cfg": "key = fixture\n",
    "example.config": "key = fixture\n",
]

func run() throws {
    let args = Array(CommandLine.arguments.dropFirst())
    try require(args.count == 1 || args.count == 3,
                "Usage: quicklook-registration-probe FIXTURE_DIR [INSTALLED_APP BASELINE_JSON]")
    let fixtureDir = URL(fileURLWithPath: args[0], isDirectory: true)
    let workspace = NSWorkspace.shared
    var payloads = fixtures.mapValues { Data($0.utf8) }
    for (name, format) in [("xml.plist", PropertyListSerialization.PropertyListFormat.xml),
                           ("binary.plist", .binary)] {
        payloads[name] = try PropertyListSerialization.data(fromPropertyList: ["key": "value"],
                                                            format: format, options: 0)
    }
    let previewTypes: [String]
    let baseline: [String: FileObservation]
    if args.count == 3 {
        let app = URL(fileURLWithPath: args[1], isDirectory: true)
        let extensionPlist = app.appendingPathComponent("Contents/PlugIns/MarkWriterQuickLook.appex/Contents/Info.plist")
        let plist = try propertyList(extensionPlist)
        let declarations = plist["NSExtension"] as? [String: Any]
        let attributes = declarations?["NSExtensionAttributes"] as? [String: Any]
        previewTypes = attributes?["QLSupportedContentTypes"] as? [String] ?? []
        try require(declarations?["NSExtensionPointIdentifier"] as? String == "com.apple.quicklook.preview",
                    "Expected the packaged Quick Look preview extension")
        try require(previewTypes.contains(UTType.xmlPropertyList.identifier),
                    "Expected the narrow Apple XML property-list declaration")
        let excludedTypes = [UTType.item, .data, .text, .plainText, .script, .movie,
                             .propertyList, .binaryPropertyList]
        try require(excludedTypes.allSatisfy { !previewTypes.contains($0.identifier) },
                    "Found an excluded type in the packaged preview declarations")
        let hostPlist = try propertyList(app.appendingPathComponent("Contents/Info.plist"))
        let imports = hostPlist["UTImportedTypeDeclarations"] as? [[String: Any]] ?? []
        try require(tomlPreviewTypes.isSubset(of: previewTypes),
                    "Expected both the existing and fallback TOML preview types")
        try require(!imports.contains { $0["UTTypeIdentifier"] as? String == "public.toml" },
                    "The host must not replace existing public.toml filename tags")
        let toml = imports.filter { $0["UTTypeIdentifier"] as? String == "com.markwriter.toml-source" }
        let tomlTags = toml.first?["UTTypeTagSpecification"] as? [String: Any]
        try require(toml.count == 1 && tomlTags?["public.filename-extension"] as? [String] == ["toml"] &&
                    toml.first?["UTTypeConformsTo"] as? [String] == ["public.toml", "public.text"],
                    "Expected the narrow fallback TOML type")
        for (name, identifier) in expectedScriptTypes {
            let declarations = imports.filter { $0["UTTypeIdentifier"] as? String == identifier }
            let tags = declarations.first?["UTTypeTagSpecification"] as? [String: Any]
            try require(declarations.count == 1 &&
                        tags?["public.filename-extension"] as? [String] == [(name as NSString).pathExtension] &&
                        previewTypes.contains(identifier), "Missing or overbroad preview declaration for \(name)")
        }
        baseline = try JSONDecoder().decode([String: FileObservation].self,
                                          from: Data(contentsOf: URL(fileURLWithPath: args[2])))
    } else {
        try FileManager.default.createDirectory(at: fixtureDir, withIntermediateDirectories: false)
        for (name, bytes) in payloads {
            try bytes.write(to: fixtureDir.appendingPathComponent(name), options: .withoutOverwriting)
        }
        previewTypes = []
        baseline = [:]
    }

    var results: [String: FileObservation] = [:]
    var violations: [String] = []
    for (name, bytes) in payloads {
        let url = fixtureDir.appendingPathComponent(name)
        let existing = try Data(contentsOf: url)
        try require(existing == bytes, "Synthetic fixture changed: \(name)")
        let ext = url.pathExtension
        let type = try url.resourceValues(forKeys: [.contentTypeKey]).contentType
        let editor = workspace.urlForApplication(toOpen: url)?.resolvingSymlinksInPath()
        let matchingPreviewTypes = previewTypes.filter { identifier in
            guard let type, let declared = UTType(identifier) else { return false }
            return type.conforms(to: declared)
        }
        let current = FileObservation(
            contentType: type?.identifier,
            extensionTypes: ext.isEmpty ? [] : UTType.types(tag: ext, tagClass: .filenameExtension,
                                                          conformingTo: nil).map(\.identifier),
            defaultApplication: editor?.path,
            matchingPreviewTypes: matchingPreviewTypes,
            expectedPreviewType: expectedScriptTypes[name]
        )
        results[name] = current

        // The app already has an alternate Markdown editor role. Test source
        // formats independently of that longstanding document association.
        if let prior = baseline[name], name != "example.md", name != "example.markdown" {
            if let original = prior.defaultApplication, current.defaultApplication != original {
                violations.append("Existing default application changed for \(name)")
            }
            if let editor, Bundle(url: editor)?.bundleIdentifier == "com.markwriter.app" {
                violations.append("MarkWriter became the default for \(name)")
            }
        }
        // If a host already declares a competing script type, report the
        // actual match and preserve its defaults instead of requiring priority.
        if let expected = expectedScriptTypes[name], let prior = baseline[name],
           prior.extensionTypes.allSatisfy({ $0.hasPrefix("dyn.") || $0 == expected }),
           !matchingPreviewTypes.contains(expected) {
            violations.append("\(name) resolves to \(current.contentType ?? "no content type"); expected \(expected)")
        }
        if name == "example.toml", baseline[name] != nil, tomlPreviewTypes.isDisjoint(with: matchingPreviewTypes) {
            violations.append("example.toml resolves to \(current.contentType ?? "no content type"); expected a TOML preview type")
        }
        if name == "example.ts", let prior = baseline[name], prior.contentType != current.contentType {
            violations.append("The ambiguous .ts content type changed")
        }
    }

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    FileHandle.standardOutput.write(try encoder.encode(results))
    FileHandle.standardOutput.write(Data("\n".utf8))
    try require(violations.isEmpty, violations.sorted().joined(separator: "\n"))
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
