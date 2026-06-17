use gateway_core::api::{BufferChangeBatch, BufferTextChange};
use gateway_core::error::SessionError;

pub fn apply_text_change_batches(
    base_content: &str,
    batches: &[BufferChangeBatch],
) -> Result<String, SessionError> {
    let mut content = base_content.to_string();
    let mut previous_seq = 0_u64;

    for batch in batches {
        if batch.seq <= previous_seq {
            return Err(SessionError::InvalidRequest(format!(
                "buffer change batches must be ordered by increasing seq: {} after {}",
                batch.seq, previous_seq
            )));
        }
        previous_seq = batch.seq;

        for change in &batch.changes {
            apply_text_change(&mut content, change)?;
        }
    }

    Ok(content)
}

pub fn apply_text_change(
    content: &mut String,
    change: &BufferTextChange,
) -> Result<(), SessionError> {
    let start = utf16_offset_to_byte_index(content, change.range_offset_utf16)?;
    let end_utf16 = change
        .range_offset_utf16
        .checked_add(change.range_length_utf16)
        .ok_or_else(|| SessionError::InvalidRequest("edit range length overflows".into()))?;
    let end = utf16_offset_to_byte_index(content, end_utf16)?;

    let range_start = position_to_byte_index(
        content,
        change.range.start.line,
        change.range.start.character,
    )?;
    let range_end =
        position_to_byte_index(content, change.range.end.line, change.range.end.character)?;
    if range_start != start || range_end != end {
        return Err(SessionError::InvalidRequest(
            "edit range position does not match UTF-16 offset".into(),
        ));
    }

    if start > end {
        return Err(SessionError::InvalidRequest(
            "edit range start is after end".into(),
        ));
    }

    content.replace_range(start..end, &change.text);
    Ok(())
}

fn utf16_offset_to_byte_index(content: &str, target_offset: usize) -> Result<usize, SessionError> {
    let mut utf16_offset = 0_usize;

    for (byte_index, character) in content.char_indices() {
        if utf16_offset == target_offset {
            return Ok(byte_index);
        }
        utf16_offset += character.len_utf16();
        if utf16_offset > target_offset {
            return Err(SessionError::InvalidRequest(
                "edit offset splits a UTF-16 surrogate pair".into(),
            ));
        }
    }

    if utf16_offset == target_offset {
        return Ok(content.len());
    }

    Err(SessionError::InvalidRequest(
        "edit offset is outside the document".into(),
    ))
}

fn position_to_byte_index(
    content: &str,
    target_line: usize,
    target_character: usize,
) -> Result<usize, SessionError> {
    let mut line = 0_usize;
    let mut line_start = 0_usize;
    let bytes = content.as_bytes();
    let mut index = 0_usize;

    while index < bytes.len() {
        if line == target_line {
            return line_character_to_byte_index(
                content,
                line_start,
                line_end(content, line_start),
                target_character,
            );
        }

        match bytes[index] {
            b'\n' => {
                line += 1;
                index += 1;
                line_start = index;
            }
            _ => index += 1,
        }
    }

    if line == target_line {
        return line_character_to_byte_index(content, line_start, content.len(), target_character);
    }

    Err(SessionError::InvalidRequest(
        "edit line is outside the document".into(),
    ))
}

fn line_end(content: &str, line_start: usize) -> usize {
    content[line_start..]
        .find('\n')
        .map(|offset| line_start + offset)
        .unwrap_or(content.len())
}

fn line_character_to_byte_index(
    content: &str,
    line_start: usize,
    line_end: usize,
    target_character: usize,
) -> Result<usize, SessionError> {
    let line_text = &content[line_start..line_end];
    let mut utf16_offset = 0_usize;

    for (relative_byte_index, character) in line_text.char_indices() {
        if utf16_offset == target_character {
            return Ok(line_start + relative_byte_index);
        }
        utf16_offset += character.len_utf16();
        if utf16_offset > target_character {
            return Err(SessionError::InvalidRequest(
                "edit character splits a UTF-16 surrogate pair".into(),
            ));
        }
    }

    if utf16_offset == target_character {
        return Ok(line_end);
    }

    Err(SessionError::InvalidRequest(
        "edit character is outside the line".into(),
    ))
}

#[cfg(test)]
mod tests {
    use gateway_core::api::{
        BufferChangeBatch, BufferChangeSource, BufferTextChange, BufferTextRange, TextPosition,
    };

    use super::apply_text_change_batches;

    #[test]
    fn apply_text_change_batches_should_apply_single_line_insert() {
        let changed = apply_text_change_batches(
            "hello",
            &[batch(1, vec![change(5, 0, 0, 5, 0, 5, " world")])],
        )
        .expect("apply edit");

        assert_eq!(changed, "hello world");
    }

    #[test]
    fn apply_text_change_batches_should_apply_monaco_multi_edit_order() {
        let changed = apply_text_change_batches(
            "abcdef",
            &[batch(
                1,
                vec![change(4, 1, 0, 4, 0, 5, "X"), change(1, 1, 0, 1, 0, 2, "Y")],
            )],
        )
        .expect("apply edit");

        assert_eq!(changed, "aYcdXf");
    }

    #[test]
    fn apply_text_change_batches_should_apply_multiline_replacement() {
        let changed = apply_text_change_batches(
            "one\ntwo\nthree",
            &[batch(1, vec![change(4, 4, 1, 0, 2, 0, "2\n")])],
        )
        .expect("apply edit");

        assert_eq!(changed, "one\n2\nthree");
    }

    #[test]
    fn apply_text_change_batches_should_use_utf16_offsets_for_emoji() {
        let changed =
            apply_text_change_batches("a😀b", &[batch(1, vec![change(1, 2, 0, 1, 0, 3, "🙂")])])
                .expect("apply edit");

        assert_eq!(changed, "a🙂b");
    }

    #[test]
    fn apply_text_change_batches_should_preserve_crlf_positions() {
        let changed = apply_text_change_batches(
            "one\r\ntwo\r\n",
            &[batch(1, vec![change(5, 3, 1, 0, 1, 3, "TWO")])],
        )
        .expect("apply edit");

        assert_eq!(changed, "one\r\nTWO\r\n");
    }

    #[test]
    fn apply_text_change_batches_should_reject_out_of_order_seq() {
        let error = apply_text_change_batches(
            "hello",
            &[
                batch(2, vec![change(5, 0, 0, 5, 0, 5, "!")]),
                batch(1, vec![change(6, 0, 0, 6, 0, 6, "?")]),
            ],
        )
        .expect_err("reject unordered batches");

        assert!(error.to_string().contains("increasing seq"));
    }

    #[test]
    fn apply_text_change_batches_should_reject_invalid_range() {
        let error =
            apply_text_change_batches("a😀b", &[batch(1, vec![change(2, 0, 0, 2, 0, 2, "x")])])
                .expect_err("reject invalid range");

        assert!(error.to_string().contains("surrogate pair"));
    }

    fn batch(seq: u64, changes: Vec<BufferTextChange>) -> BufferChangeBatch {
        BufferChangeBatch {
            seq,
            source: BufferChangeSource::User,
            model_version_id: seq,
            alternative_version_id: seq,
            changes,
            eol: None,
        }
    }

    fn change(
        range_offset_utf16: usize,
        range_length_utf16: usize,
        start_line: usize,
        start_character: usize,
        end_line: usize,
        end_character: usize,
        text: &str,
    ) -> BufferTextChange {
        BufferTextChange {
            range: BufferTextRange {
                start: TextPosition {
                    line: start_line,
                    character: start_character,
                },
                end: TextPosition {
                    line: end_line,
                    character: end_character,
                },
            },
            range_offset_utf16,
            range_length_utf16,
            text: text.to_string(),
        }
    }
}
