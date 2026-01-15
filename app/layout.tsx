import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Email Verifier - Validate Your Email List',
  description: 'Bulk email verification tool to validate email addresses and filter out invalid, disposable, and risky emails.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
