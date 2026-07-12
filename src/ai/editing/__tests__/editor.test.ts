import { describe, it, expect } from 'vitest';
import { DiagramEditor, EDIT_STAGES } from '../DiagramEditor';
import type { EditStageUpdate } from '../DiagramEditor';
import { EditError } from '../errors';
import { CancelledError } from '../../core/AIError';
import { sampleDiagram, contextSource, editingService, scriptedService, recordingGateway } from './helpers';
import { DiagramModel } from '@/dsl';

const { doc, ids } = sampleDiagram();

function editor(service = editingService(), source = contextSource(doc), gateway = recordingGateway()) {
  const ed = new DiagramEditor({ service, gateway, contextSource: source });
  return { ed, gateway };
}

describe('DiagramEditor.propose', () => {
  it('returns a preview (not applied) for a clear edit', async () => {
    const { ed, gateway } = editor();
    const proposal = await ed.propose({ prompt: 'Add Redis between the API and the Database', stream: false });
    expect(proposal.status).toBe('preview');
    expect(proposal.preview!.changes.length).toBeGreaterThan(0);
    expect(proposal.operations!.operations.length).toBeGreaterThan(0);
    expect(gateway.plans).toHaveLength(0); // nothing applied yet
  });

  it('reports staged progress ending at preview', async () => {
    const updates: EditStageUpdate[] = [];
    const { ed } = editor();
    await ed.propose({ prompt: 'Delete the Database', stream: true }, { onStage: (u) => updates.push(u) });
    const done = updates.filter((u) => u.state === 'done').map((u) => u.stage);
    expect(done).toEqual(['understanding', 'planning', 'validating', 'preview']);
  });

  it('asks for clarification on an ambiguous reference instead of guessing', async () => {
    // Canned plan that removes an ambiguous "service".
    const plan = JSON.stringify({ edits: [{ op: 'remove_node', target: { by: 'descriptor', text: 'service' } }], confidence: 0.9 });
    const { ed, gateway } = editor(scriptedService(plan, plan));
    const proposal = await ed.propose({ prompt: 'delete the service', stream: false });
    expect(proposal.status).toBe('clarify');
    expect(proposal.clarifications[0]!.candidates).toHaveLength(2);
    expect(gateway.plans).toHaveLength(0);
    // Applying a clarify proposal is refused.
    expect(() => ed.apply(proposal)).toThrow(EditError);
  });

  it('self-heals: retries once when the first plan is invalid, then previews', async () => {
    const good = JSON.stringify({ edits: [{ op: 'rename_node', target: { by: 'label', label: 'API' }, label: 'Edge Gateway' }], confidence: 0.9 });
    const { ed } = editor(scriptedService('{"not":"a plan"}', good));
    const proposal = await ed.propose({ prompt: 'rename API', stream: false });
    expect(proposal.status).toBe('preview');
  });

  it('errors (no mutation) when references cannot be resolved after retries', async () => {
    const bad = JSON.stringify({ edits: [{ op: 'remove_node', target: { by: 'label', label: 'Kafka' } }], confidence: 0.9 });
    const { ed, gateway } = editor(scriptedService(bad, bad));
    await expect(ed.propose({ prompt: 'delete kafka', stream: false })).rejects.toBeInstanceOf(EditError);
    expect(gateway.plans).toHaveLength(0);
  });

  it('refuses to edit an empty diagram', async () => {
    const empty = contextSource(DiagramModel.create().document);
    const { ed } = editor(editingService(), empty);
    await expect(ed.propose({ prompt: 'add a node', stream: false })).rejects.toBeInstanceOf(EditError);
  });

  it('cancels cleanly before any mutation', async () => {
    const controller = new AbortController();
    controller.abort();
    const { ed, gateway } = editor();
    await expect(ed.propose({ prompt: 'rename API to X', signal: controller.signal, stream: false })).rejects.toBeInstanceOf(CancelledError);
    expect(gateway.plans).toHaveLength(0);
  });
});

describe('DiagramEditor.apply', () => {
  it('applies an approved preview to the gateway', async () => {
    const { ed, gateway } = editor();
    const proposal = await ed.propose({ prompt: 'Rename API to Edge Gateway', stream: false });
    const result = ed.apply(proposal);
    expect(result.applied.applied).toBeGreaterThan(0);
    expect(gateway.plans).toHaveLength(1);
  });

  it('has EDIT_STAGES covering the whole two-phase flow', () => {
    expect(EDIT_STAGES.map((s) => s.stage)).toEqual(['understanding', 'planning', 'validating', 'preview', 'executing', 'rendering']);
    expect(ids.api).toBeDefined();
  });
});
