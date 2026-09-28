//! The Windows executable icon is a generated artefact (`pnpm icon`); this
//! pins its shape so a broken generator cannot land a file Explorer would
//! reject: PNG-compressed frames covering the tab size up to 256px.

use std::path::Path;

fn icon_bytes() -> Vec<u8> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("frontend/icon/gitreant.ico");
    std::fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

#[test]
fn the_ico_holds_png_frames_from_16_to_256_pixels() {
    let ico = icon_bytes();
    let u16_at = |at: usize| u16::from_le_bytes([ico[at], ico[at + 1]]);
    let u32_at = |at: usize| u32::from_le_bytes([ico[at], ico[at + 1], ico[at + 2], ico[at + 3]]);
    assert_eq!((u16_at(0), u16_at(2)), (0, 1), "ICONDIR header: reserved 0, type 1 (icon)");
    let count = u16_at(4) as usize;
    assert!(count >= 7, "expected small and large frames, found {count}");

    let mut sizes = Vec::new();
    for i in 0..count {
        let entry = 6 + 16 * i;
        let width = match ico[entry] {
            0 => 256,
            w => w as usize,
        };
        let (length, offset) = (u32_at(entry + 8) as usize, u32_at(entry + 12) as usize);
        let frame = &ico[offset..offset + length];
        assert!(
            frame.starts_with(b"\x89PNG\r\n\x1a\n"),
            "frame {width}px is not PNG-compressed"
        );
        sizes.push(width);
    }
    for required in [16, 32, 48, 256] {
        assert!(sizes.contains(&required), "no {required}px frame in {sizes:?}");
    }
}
