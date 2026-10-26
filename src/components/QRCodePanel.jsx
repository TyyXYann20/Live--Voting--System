import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, Printer, Expand, Smartphone } from "lucide-react";
import { Modal, useToast } from "./UI";
import { votingUrl } from "../utils/results";
export default function QRCodePanel({ session }) {
  const ref = useRef();
  const [enlarged, setEnlarged] = useState(false);
  const toast = useToast();
  const url = votingUrl(session.id);
  function download() {
    const a = document.createElement("a");
    a.download = `pulse-${session.id}.png`;
    a.href = ref.current.toDataURL("image/png");
    a.click();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Voting link copied");
    } catch {
      toast("Could not copy. Select the voting link below.", true);
    }
  }
  return (
    <aside className="panel qr-panel">
      <div className="section-heading">
        <Smartphone size={23} />
        <div>
          <h2>Scan to vote</h2>
          <p>{session.name}</p>
        </div>
      </div>
      <button
        className="qr-image"
        aria-label="Enlarge QR code"
        onClick={() => setEnlarged(true)}
      >
        <QRCodeCanvas
          ref={ref}
          value={url}
          size={240}
          marginSize={3}
          level="M"
        />
        <Expand className="qr-expand" size={17} />
      </button>
      <ol className="instructions">
        <li>Scan the QR code with your phone</li>
        <li>
          {session.require_codes
            ? "Enter your participant code"
            : "Enter your name and team"}
        </li>
        <li>Vote for another team</li>
      </ol>
      <div className="copy-link">
        <input aria-label="Voting link" value={url} readOnly />
        <button aria-label="Copy voting link" onClick={copy}>
          <Copy size={16} />
        </button>
      </div>
      <button className="secondary full" onClick={download}>
        <Download size={16} />
        Download QR code
      </button>
      <button className="text-button full" onClick={() => window.print()}>
        <Printer size={15} />
        Print QR
      </button>
      {enlarged && (
        <Modal title="Scan to vote" onClose={() => setEnlarged(false)}>
          <div className="enlarged-qr">
            <QRCodeCanvas value={url} size={320} marginSize={4} />
            <h3>{session.name}</h3>
            <p className="muted">{url}</p>
          </div>
        </Modal>
      )}
    </aside>
  );
}
