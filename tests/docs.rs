//! Structural checks for the bilingual documentation: the Japanese ADRs are
//! canonical, English bodies are optional, but the two index tables must
//! describe the same set of ADRs and every link must be honest.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn adr_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("docs/adr")
}

/// The `NNNN -> linked file` rows of an index table.
fn index_rows(readme: &str) -> BTreeMap<String, String> {
    let text = fs::read_to_string(adr_dir().join(readme)).expect(readme);
    let mut rows = BTreeMap::new();
    for line in text.lines() {
        // | [NNNN](NNNN-slug.md) | title | status |
        let Some(rest) = line.trim().strip_prefix("| [") else {
            continue;
        };
        let Some((id, rest)) = rest.split_once("](") else {
            continue;
        };
        let Some((link, _)) = rest.split_once(')') else {
            continue;
        };
        rows.insert(id.to_string(), link.to_string());
    }
    rows
}

#[test]
fn adr_indexes_list_the_same_adrs_with_matching_slugs() {
    let jp = index_rows("README.jp.md");
    let en = index_rows("README.md");
    assert!(!jp.is_empty(), "the Japanese index parsed no rows");

    let jp_ids: Vec<_> = jp.keys().collect();
    let en_ids: Vec<_> = en.keys().collect();
    assert_eq!(
        jp_ids, en_ids,
        "both index tables must list the same ADR numbers"
    );

    for (id, jp_link) in &jp {
        let en_link = &en[id];
        // NNNN-slug.jp.md on the Japanese side, NNNN-slug.md on the English
        // side — the slug itself must agree.
        let jp_slug = jp_link.strip_suffix(".jp.md");
        let en_slug = en_link.strip_suffix(".md");
        assert_eq!(
            jp_slug, en_slug,
            "ADR {id}: index links disagree ({jp_link} vs {en_link})"
        );
    }
}

#[test]
fn every_japanese_adr_is_indexed_and_every_jp_link_resolves() {
    let jp = index_rows("README.jp.md");
    let dir = adr_dir();

    // Every jp index row links to a real file (the Japanese side is
    // canonical; English rows may pre-link bodies written later).
    for (id, link) in &jp {
        assert!(
            dir.join(link).exists(),
            "ADR {id}: {link} is linked from README.jp.md but missing"
        );
    }

    // Every NNNN-*.jp.md on disk appears in the index.
    for entry in fs::read_dir(&dir).expect("read docs/adr") {
        let name = entry.expect("dir entry").file_name();
        let name = name.to_string_lossy().into_owned();
        if name.ends_with(".jp.md") && name != "README.jp.md" {
            assert!(
                jp.values().any(|link| link == &name),
                "{name} exists but is not listed in README.jp.md"
            );
        }
    }
}

#[test]
fn every_english_adr_body_has_its_japanese_canonical() {
    let dir = adr_dir();
    for entry in fs::read_dir(&dir).expect("read docs/adr") {
        let name = entry.expect("dir entry").file_name();
        let name = name.to_string_lossy().into_owned();
        if !name.ends_with(".md") || name.ends_with(".jp.md") || name == "README.md" {
            continue;
        }
        let jp = format!("{}.jp.md", name.strip_suffix(".md").unwrap());
        assert!(
            dir.join(&jp).exists(),
            "{name} exists without its Japanese canonical {jp}"
        );
    }
}
