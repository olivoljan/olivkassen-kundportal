import { CircleHelp } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="w-full bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <a
        href="https://www.olivkassen.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/67a38a8645686cca76b775ec_olivkassen-logo.svg"
          alt="Olivkassen"
          className="h-8"
        />
      </a>

      <a
        href="https://www.olivkassen.com/kontakta-oss"
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-gray-600 transition"
      >
        <CircleHelp className="w-5 h-5" />
        <span className="text-xs">Support</span>
      </a>
    </header>
  );
}
