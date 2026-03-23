import { useEffect } from "react";
import { Button, Card } from "./ui";

export default function BottomSheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { open, title, onClose, children } = props;

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
        <div className="mx-auto max-w-md">
          <Card className="rounded-[28px] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">{title}</div>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
            {children}
          </Card>
        </div>
      </div>
    </div>
  );
}