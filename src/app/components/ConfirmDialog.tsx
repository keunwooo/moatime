import { useEffect, useRef } from 'react';

export function ConfirmDialog(props: {
  title: string;
  body: React.ReactNode;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dlg-title" onClose={props.onClose} onCancel={props.onClose}>
      <h2 id="dlg-title">{props.title}</h2>
      <div className="dialog-body">{props.body}</div>
      <div className="controls">
        <button type="button" className="btn" autoFocus onClick={props.onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            props.onConfirm();
            props.onClose();
          }}
        >
          {props.confirm}
        </button>
      </div>
    </dialog>
  );
}
