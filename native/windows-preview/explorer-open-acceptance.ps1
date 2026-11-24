# Sourced only by the bundled, disposable Windows Explorer fixture.
function Test-ExplorerDocumentOpening($targets, $other) {
  $observedWorkspace = @{}
  function Wait-ExplorerWorkspace($condition, $description, $allowTimeout = $false) {
    $candidates = if ($observedWorkspace.path) { @($observedWorkspace.path) } else { $workspaces }
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      foreach ($workspace in $candidates) {
        $snapshot = Read-FixtureWorkspace $workspace
        if ($snapshot -and (& $condition $snapshot)) {
          $observedWorkspace.path = $workspace
          return $snapshot
        }
      }
      Start-Sleep -Milliseconds 200
    }
    if (!$allowTimeout) { throw "Installed Explorer evidence timed out: $description" }
  }
  function Find-OpenedFixture($snapshot, $fixture) {
    $path = [IO.Path]::Combine($canonicalFixtureFolder, $fixture.Name)
    $snapshot.documents | Where-Object { $_.path -ieq $path }
  }
  function Get-ActiveDocument($snapshot) {
    $snapshot.documents | Where-Object { $_.id -eq $snapshot.activeId }
  }
  function Use-EditorKeys($keys) {
    [PreviewProcessIntegrity]::SetForegroundWindow($editorWindow) | Out-Null
    if ([PreviewProcessIntegrity]::GetForegroundWindow() -ne $editorWindow) { throw 'Installed editor did not become foreground' }
    [System.Windows.Forms.SendKeys]::SendWait($keys)
  }
  function Confirm-SameEditor {
    $running = @(Get-Process markwriter -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq $resolvedApp -and $_.MainWindowHandle })
    if ($running.Count -ne 1 -or $running[0].Id -ne $appProcess.Id -or $running[0].MainWindowHandle -ne $editorWindow) {
      throw 'Explorer opening did not preserve the single installed editor window'
    }
  }
  $draft = $targets[0]
  $newFiles = $targets[1..2]
  $hashes = @{}
  foreach ($target in $targets) { $hashes[$target.Name] = (Get-FileHash -LiteralPath (Join-Path $root $target.Name)).Hash }
  if ((Open-ThroughExplorer $draft).Id -ne $appProcess.Id) { throw 'Draft fixture did not reach the running editor' }
  $editorWindow = $appProcess.MainWindowHandle
  $editor = [System.Windows.Automation.AutomationElement]::FromHandle($editorWindow)
  $modeName = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Markdown mode')
  $mode = $editor.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $modeName)
  if (!$mode) { throw 'Installed editor did not expose the Markdown mode switch' }
  $mode.SetFocus()
  Use-EditorKeys ' '
  $plain = Wait-ExplorerWorkspace {
    param($snapshot)
    $doc = Get-ActiveDocument $snapshot
    $doc.title -ceq $draft.Name -and $doc.mode -eq 'markdown' -and !$doc.isDirty -and $doc.content -ceq $draft.Text
  } 'source mode for the clean draft fixture'
  $draftId = $plain.activeId
  $draftPath = (Get-ActiveDocument $plain).path
  if (!$draftPath -or [IO.Path]::GetFileName($draftPath) -ine $draft.Name) { throw 'The draft fixture has no matching canonical path.' }
  # The shell and recovery API can spell the same folder differently, for example
  # a Win32 short temp path versus the editor's canonical long path.
  $canonicalFixtureFolder = [IO.Path]::GetDirectoryName($draftPath)
  $suffix = 'x'
  Use-EditorKeys '^{END}'
  Use-EditorKeys $suffix
  $draftText = $draft.Text + $suffix
  $edited = Wait-ExplorerWorkspace {
    param($snapshot)
    $doc = Get-ActiveDocument $snapshot
    $doc.id -eq $draftId -and $doc.isDirty -and $doc.content -ceq $draftText -and $doc.savedContent -ceq $draft.Text
  } 'exact unsaved draft persisted for the owning tab'
  $revision = (Get-ActiveDocument $edited).revision
  function Confirm-DirtyOwner($snapshot, $stage) {
    $owners = @(Find-OpenedFixture $snapshot $draft)
    $byId = $snapshot.documents | Where-Object { $_.id -eq $draftId } | Select-Object -First 1
    if ($owners.Count -ne 1 -or $owners[0].id -ne $draftId -or $owners[0].revision -ne $revision -or
        !$owners[0].isDirty -or $owners[0].content -cne $draftText -or $owners[0].savedContent -cne $draft.Text) {
      throw ("{0}: expected one dirty owner, found {1}; expected ID present: {2}; revision: {3} (expected {4}); dirty: {5}; exact edit: {6}; exact saved bytes: {7}." -f
        $stage, $owners.Count, [bool]$byId, $byId.revision, $revision, $byId.isDirty, ($byId.content -ceq $draftText), ($byId.savedContent -ceq $draft.Text))
    }
  }
  function Switch-AwayFromDraft {
    if ((Open-ThroughExplorer $other).Id -ne $appProcess.Id) { throw 'Switch-away fixture did not reach the running editor' }
    $state = Wait-ExplorerWorkspace {
      param($snapshot)
      (Get-ActiveDocument $snapshot).title -ceq $other.Name
    } 'another tab active before Explorer reopens the draft'
    Confirm-DirtyOwner $state 'after switching away'
  }
  Switch-AwayFromDraft
  $control = Invoke-ExplorerOpen @($draft)
  $reopened = Wait-ExplorerWorkspace { param($snapshot) $snapshot.activeId -eq $draftId } 'Explorer reactivating the dirty tab'
  $control.endedAtUtc = [DateTime]::UtcNow.ToString('o')
  Confirm-DirtyOwner $reopened 'after single-file Explorer activation'
  Confirm-SameEditor

  Switch-AwayFromDraft
  $batch = Invoke-ExplorerOpen $targets
  $batch.dirtyOwnerActivated = $false
  $null = Wait-ExplorerWorkspace {
    param($snapshot)
    if ($snapshot.activeId -eq $draftId) { $batch.dirtyOwnerActivated = $true }
    foreach ($file in $newFiles) { if (!(Find-OpenedFixture $snapshot $file)) { return $false } }
    return $true
  } 'all new files in the multi-selection reaching the editor' $true
  # Re-read after queued opens settle, then preserve what arrived independently
  # of what was selected in Explorer and observed in the process-start trace.
  Start-Sleep -Milliseconds 750
  $after = Wait-ExplorerWorkspace {
    param($snapshot)
    $snapshot.documents.id -contains $draftId
  } 'workspace after Explorer multi-selection'
  $batch.endedAtUtc = [DateTime]::UtcNow.ToString('o')
  if ($after.activeId -eq $draftId) { $batch.dirtyOwnerActivated = $true }
  Confirm-DirtyOwner $after 'after multi-selection'
  Confirm-SameEditor
  $batch.opened = @(foreach ($file in $newFiles) {
    $matches = @(Find-OpenedFixture $after $file)
    if (!$matches.Count) { continue }
    if ($matches.Count -ne 1 -or $matches[0].content -cne $file.Text -or $matches[0].isDirty) {
      throw "Explorer multi-selection did not deliver one clean, exact document for $($file.Name)"
    }
    @{ name = $file.Name; id = $matches[0].id }
  })

  Switch-AwayFromDraft
  $closingControl = Invoke-ExplorerOpen @($draft)
  $after = Wait-ExplorerWorkspace { param($snapshot) $snapshot.activeId -eq $draftId } 'return to the dirty tab after multi-selection'
  $closingControl.endedAtUtc = [DateTime]::UtcNow.ToString('o')
  Confirm-DirtyOwner $after 'after final Explorer activation'
  Use-EditorKeys '^z'
  $undone = Wait-ExplorerWorkspace {
    param($snapshot)
    $doc = Get-ActiveDocument $snapshot
    $doc.id -eq $draftId -and !$doc.isDirty -and $doc.content -ceq $draft.Text -and $doc.revision -gt $revision
  } 'ordinary Undo restoring the original clean Markdown'
  Confirm-SameEditor
  foreach ($target in $targets) {
    if ((Get-FileHash -LiteralPath (Join-Path $root $target.Name)).Hash -cne $hashes[$target.Name]) { throw 'Explorer activation or Undo changed a source file' }
  }
  @{ editorPid = $appProcess.Id; explorerPid = $explorerPid; draftId = $draftId; draftRevision = $revision;
     undoRevision = (Get-ActiveDocument $undone).revision; sourceSha256 = $hashes; control = $control; batch = $batch; closingControl = $closingControl }
}
