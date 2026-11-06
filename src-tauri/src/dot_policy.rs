// Only the bundled DOT worker receives WASM compilation permission. The document
// keeps its existing policy, and the worker cannot connect/load images/fonts.
pub const WORKER_CSP: &str = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'";
pub fn is_dot_worker(path: &str) -> bool {
    path.starts_with("/assets/dotWorker-") && path.ends_with(".js") && !path[8..].contains('/')
}
// Math is pure JavaScript: no WASM or network capability is needed.
pub const MATH_WORKER_CSP: &str = "default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'";
pub fn is_math_worker(path: &str) -> bool {
    path.starts_with("/assets/mathWorker-") && path.ends_with(".js") && !path[8..].contains('/')
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn math_worker_has_no_network_or_wasm_permission() {
        assert!(is_math_worker("/assets/mathWorker-a1B2.js"));
        for path in ["/index.html", "/assets/mathWorker-x.js/other.js", "/mathWorker.js", "/assets/dotWorker-x.js"] {
            assert!(!is_math_worker(path));
        }
        assert!(!MATH_WORKER_CSP.contains("eval"));
        assert!(MATH_WORKER_CSP.contains("connect-src 'none'"));
    }
    #[test]
    fn only_bundled_worker_gets_wasm_policy() {
        assert!(is_dot_worker("/assets/dotWorker-a1B2.js"));
        for path in ["/index.html", "/assets/index-123.js", "/assets/dotWorker-x.js/other.js", "/dotWorker.js"] {
            assert!(!is_dot_worker(path));
        }
        assert!(!WORKER_CSP.contains("'unsafe-eval'"));
        assert!(WORKER_CSP.contains("connect-src 'none'"));
    }
}
