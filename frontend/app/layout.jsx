import "./globals.css";

export const metadata = {
  title: "MP3 Downloader — DJ Edition",
  description: "Download YouTube and SoundCloud tracks as MP3 files for DJing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-grid-pattern">{children}</body>
    </html>
  );
}
