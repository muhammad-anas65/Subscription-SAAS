import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';


export const metadata: Metadata = {
  title: 'SubTrack - Subscription Management',
  description: 'Track and manage your SaaS subscriptions',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
