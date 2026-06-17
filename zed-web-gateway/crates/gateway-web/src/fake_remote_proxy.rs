use std::collections::HashMap;
use std::path::{Path, PathBuf};

use gateway_zed_proxy::client::IntoEnvelope;
use gateway_zed_proxy::messages::{self, Envelope};
use prost::Message;
use tokio::io::{self, AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut next_message_id = 10_u32;
    let mut next_buffer_id = 100_u64;
    let mut worktree_id = 1_u64;
    let mut root = std::env::current_dir()?;
    let mut opened = HashMap::<u64, OpenedFakeBuffer>::new();
    let mut path_versions = HashMap::<PathBuf, Vec<messages::VectorClockEntry>>::new();

    loop {
        let envelope = read_envelope(&mut stdin).await?;
        match envelope.payload {
            Some(messages::envelope::Payload::RemoteStarted(_)) => {
                write_envelope(
                    &mut stdout,
                    messages::RemoteStarted {}.into_envelope(next_message_id, None),
                )
                .await?;
                next_message_id += 1;
                write_envelope(
                    &mut stdout,
                    messages::Ack {}.into_envelope(next_message_id, Some(envelope.id)),
                )
                .await?;
                next_message_id += 1;
            }
            Some(messages::envelope::Payload::AddWorktree(message)) => {
                root = PathBuf::from(message.path);
                write_envelope(
                    &mut stdout,
                    messages::AddWorktreeResponse {
                        worktree_id,
                        canonicalized_path: root.display().to_string(),
                        root_repo_common_dir: None,
                    }
                    .into_envelope(next_message_id, Some(envelope.id)),
                )
                .await?;
                next_message_id += 1;
                worktree_id += 1;
            }
            Some(messages::envelope::Payload::OpenBufferByPath(message)) => {
                let file_path = root.join(&message.path);
                let content = tokio::fs::read_to_string(&file_path).await?;
                let buffer_id = next_buffer_id;
                next_buffer_id += 1;
                let saved_version = path_versions
                    .entry(file_path.clone())
                    .or_insert_with(|| {
                        vec![messages::VectorClockEntry {
                            replica_id: 1,
                            timestamp: 1,
                        }]
                    })
                    .clone();
                opened.insert(
                    buffer_id,
                    OpenedFakeBuffer {
                        path: file_path,
                        saved_version: saved_version.clone(),
                    },
                );

                write_envelope(
                    &mut stdout,
                    messages::OpenBufferResponse { buffer_id }
                        .into_envelope(next_message_id, Some(envelope.id)),
                )
                .await?;
                next_message_id += 1;

                write_envelope(
                    &mut stdout,
                    messages::CreateBufferForPeer {
                        project_id: 0,
                        peer_id: Some(messages::PeerId { owner_id: 0, id: 0 }),
                        variant: Some(messages::create_buffer_for_peer::Variant::State(
                            messages::BufferState {
                                id: buffer_id,
                                file: Some(messages::File {
                                    worktree_id: message.worktree_id,
                                    entry_id: None,
                                    path: message.path,
                                    mtime: None,
                                    is_deleted: false,
                                    is_historic: false,
                                }),
                                base_text: content,
                                line_ending: 0,
                                saved_version,
                                saved_mtime: None,
                            },
                        )),
                    }
                    .into_envelope(next_message_id, None),
                )
                .await?;
                next_message_id += 1;

                write_envelope(
                    &mut stdout,
                    messages::CreateBufferForPeer {
                        project_id: 0,
                        peer_id: Some(messages::PeerId { owner_id: 0, id: 0 }),
                        variant: Some(messages::create_buffer_for_peer::Variant::Chunk(
                            messages::BufferChunk {
                                buffer_id,
                                operations: Vec::new(),
                                is_last: true,
                            },
                        )),
                    }
                    .into_envelope(next_message_id, None),
                )
                .await?;
                next_message_id += 1;
            }
            Some(messages::envelope::Payload::UpdateBuffer(message)) => {
                let Some(buffer) = opened.get_mut(&message.buffer_id) else {
                    continue;
                };
                let mut content = tokio::fs::read_to_string(&buffer.path).await?;
                for operation in message.operations {
                    if let Some(messages::operation::Variant::Edit(edit)) = operation.variant {
                        apply_fake_edit(&mut content, &edit)?;
                        buffer.saved_version =
                            increment_version(&buffer.saved_version, edit.replica_id);
                    }
                }
                tokio::fs::write(&buffer.path, content).await?;
                path_versions.insert(buffer.path.clone(), buffer.saved_version.clone());

                write_envelope(
                    &mut stdout,
                    messages::Ack {}.into_envelope(next_message_id, Some(envelope.id)),
                )
                .await?;
                next_message_id += 1;
            }
            Some(messages::envelope::Payload::SaveBuffer(message)) => {
                write_envelope(
                    &mut stdout,
                    messages::BufferSaved {
                        project_id: message.project_id,
                        buffer_id: message.buffer_id,
                        version: opened
                            .get(&message.buffer_id)
                            .map(|buffer| buffer.saved_version.clone())
                            .unwrap_or(message.version),
                        mtime: None,
                    }
                    .into_envelope(next_message_id, Some(envelope.id)),
                )
                .await?;
                next_message_id += 1;
            }
            Some(messages::envelope::Payload::FlushBufferedMessages(_)) => {
                write_envelope(
                    &mut stdout,
                    messages::Ack {}.into_envelope(next_message_id, Some(envelope.id)),
                )
                .await?;
                next_message_id += 1;
            }
            Some(messages::envelope::Payload::Ack(_)) => {}
            Some(messages::envelope::Payload::Error(_)) => {}
            Some(messages::envelope::Payload::UpdateBufferFile(_)) => {}
            None => {}
            _ => {}
        }
    }
}

struct OpenedFakeBuffer {
    path: PathBuf,
    saved_version: Vec<messages::VectorClockEntry>,
}

fn apply_fake_edit(
    content: &mut String,
    edit: &messages::Edit,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut replacements = edit
        .ranges
        .iter()
        .zip(edit.new_text.iter())
        .map(|(range, text)| (range.start as usize, range.end as usize, text))
        .collect::<Vec<_>>();
    replacements.sort_by(|left, right| right.0.cmp(&left.0));

    for (start, end, text) in replacements {
        if start > end
            || end > content.len()
            || !content.is_char_boundary(start)
            || !content.is_char_boundary(end)
        {
            return Err("invalid fake proxy edit range".into());
        }
        content.replace_range(start..end, text);
    }

    Ok(())
}

fn increment_version(
    current_version: &[messages::VectorClockEntry],
    replica_id: u32,
) -> Vec<messages::VectorClockEntry> {
    let mut version = current_version.to_vec();
    if let Some(entry) = version
        .iter_mut()
        .find(|entry| entry.replica_id == replica_id)
    {
        entry.timestamp += 1;
    } else {
        version.push(messages::VectorClockEntry {
            replica_id,
            timestamp: 1,
        });
    }
    version
}

async fn read_envelope(
    stdin: &mut tokio::io::Stdin,
) -> Result<Envelope, Box<dyn std::error::Error>> {
    let mut len = [0_u8; 4];
    stdin.read_exact(&mut len).await?;
    let mut buffer = vec![0_u8; u32::from_le_bytes(len) as usize];
    stdin.read_exact(&mut buffer).await?;
    Ok(Envelope::decode(buffer.as_slice())?)
}

async fn write_envelope(
    stdout: &mut tokio::io::Stdout,
    envelope: Envelope,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut buffer = Vec::new();
    envelope.encode(&mut buffer)?;
    stdout
        .write_all(&(buffer.len() as u32).to_le_bytes())
        .await?;
    stdout.write_all(&buffer).await?;
    stdout.flush().await?;
    Ok(())
}

fn _normalize(path: &Path) -> String {
    path.display().to_string()
}
