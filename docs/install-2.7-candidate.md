# MarkWriter 2.7 candidate installation

The review packages identify as 2.7.0. Use the workflow artifacts for the exact candidate commit. Confirm the platform manifest’s source and SHA-256 before opening a package.

Use a disposable desktop or a disposable app target and set `MARKWRITER_PROFILE_DIR` to a new absolute directory before starting the test process. Keep existing app bundles, file associations and profiles separate. Test with copies of Markdown fixtures.

For platform packaging, existing provider requirements and rollback procedures, see [the 2.6.3 installation guide](install-2.6.3.md). A provider’s version and SHA-256 must be verified independently of the app. Remove only the disposable candidate installation and test profile after testing. Review packages use the project’s CI signing policy. The candidate has no authorized public release or installation feed.
