import "./globals.css";

export const metadata = {
  title: "Applywise — Job application email assistant",
  description: "Create thoughtful, role-aware job application emails from a job post.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
