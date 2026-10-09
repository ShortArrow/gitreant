//! gitreant: serve git commit graphs of local repositories as a single-page web app.
//!
//! This library exists so the `gitreant` binary and its integration tests
//! share one implementation. It is not a public API: the crate's version
//! follows the command-line interface, and any item here may change or
//! disappear in a minor or patch release.

pub mod app;
pub mod doctor;
pub mod domain;
pub mod git;
pub mod launch;
pub mod server;
