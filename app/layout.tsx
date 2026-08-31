import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({ variable: '--font-ui', subsets: ['latin'] });
const fraunces = Fraunces({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: 'Trazo - crea una letra más humana',
  description: 'Editor táctil para escribir, dibujar letras y alternar variantes de forma natural.',
  openGraph: {
    title: 'Trazo - crea una letra más humana',
    description: 'Dibuja varias versiones de cada letra y escribe con un ritmo más natural.',
    images: [{ url: '/og.png', width: 1536, height: 864, alt: 'Trazo, escritura con pulso' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trazo - crea una letra más humana',
    description: 'Dibuja varias versiones de cada letra y escribe con un ritmo más natural.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${dmSans.variable} ${fraunces.variable}`}>{children}</body></html>;
}
