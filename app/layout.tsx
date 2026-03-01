import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olivkassen Kundportal",
  description: "Hantera ditt abonnemang",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body
        style={{
          minHeight: "100vh",
          background: "#f4f1ea",
          margin: 0,
          fontFamily: '"Bricolage Grotesque", sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
