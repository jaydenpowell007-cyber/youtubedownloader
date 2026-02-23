import "./globals.css";

export const metadata = {
  title: "YouTube MP3 Downloader — DJ Edition",
  description: "Download YouTube videos and playlists as MP3 files for DJing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
