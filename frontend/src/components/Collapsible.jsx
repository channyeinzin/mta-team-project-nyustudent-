// A section that starts closed: just a title row you can tap to open.
// Keeps the side panel short until someone actually wants the details.

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function Collapsible({ title, icon, children }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left font-semibold hover:bg-gray-50"
      >
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown size={18} className={`text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
