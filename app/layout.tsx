import "./globals.css";
import { Bricolage_Grotesque } from "next/font/google";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" className={bricolage.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground">
        {children}

        {/* 🔥 Toast system */}
      </body>
    </html>
  );
}