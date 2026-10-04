import { useEffect, useId, useState } from 'react';
import type { Requirement } from '../api/client';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import PathField from './PathField';
import { MUTED } from '../ui/theme';

interface RequirementsDialogProps {
  requirements: Requirement[] | null;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

const KIND_ICON: Record<string, string> = { file: '📄', directory: '📁' };

/**
 * The "before running" window: what a run the page starts asks before it
 * can go -- a file or a folder for each picker with nothing chosen.
 */
export default function RequirementsDialog({ requirements, onSubmit, onCancel }: RequirementsDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const id = useId();

  // Answers are kept by each question's own key: the block that asked, which
  // the backend hands each answer to.
  useEffect(() => {
    if (requirements) {
      setValues(Object.fromEntries(requirements.map((r) => [r.key, r.current || ''])));
    }
  }, [requirements]);

  if (!requirements) return null;

  const missing = requirements
    .filter((r) => (values[r.key] ?? '').trim().length === 0)
    .map((r) => r.label);
  const canSubmit = missing.length === 0;
  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      title="Choose files for the run"
      onClose={onCancel}
      // Typed paths; a backdrop click must not discard them. Escape is the
      // deliberate way out and matches Cancel.
      dismissOnBackdrop={false}
      footer={
        <>
          {/* A greyed-out Run button with no explanation just looks broken. */}
          {missing.length > 0 && (
            <span className="text-xs mr-auto" style={{ color: MUTED }}>
              Still needed: {missing.join(', ')}
            </span>
          )}
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onSubmit(values)} disabled={!canSubmit}>▶ Run the tool</Button>
        </>
      }
    >
      <div className="px-6 pt-4 pb-1">
        <p className="text-xs" style={{ color: MUTED }}>
          The page needs a few paths before it can run.
        </p>
      </div>

      <div
        className="px-6 py-5 space-y-4"
        // Enter in a path box runs, as in every other one-purpose dialog; on
        // Browse… or a row of the file browser it is that button's, not a run.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSubmit && e.target instanceof HTMLInputElement) onSubmit(values);
        }}
      >
        {requirements.map((req, index) => (
          <div key={req.key}>
            <label htmlFor={`${id}-${index}`} className="block text-xs font-medium mb-1" style={{ color: MUTED }}>
              {KIND_ICON[req.kind] ?? '📄'}{' '}
              {`${req.kind === 'directory' ? 'Folder' : 'File'} for "${req.label}"`}
            </label>
            {/* Typing an absolute path from memory was the only way to answer
                this dialog; a path field offers a picker. */}
            <PathField
              id={`${id}-${index}`}
              value={values[req.key] ?? ''}
              onChange={(path) => set(req.key, path)}
              mode={req.kind}
              placeholder={req.kind === 'directory' ? 'Choose a folder…' : 'Choose a file…'}
              mono
              autoFocus={index === 0}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
