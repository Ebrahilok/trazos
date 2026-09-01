import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({ variable: '--font-ui', subsets: ['latin'] });
const fraunces = Fraunces({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: 'Trazo - cuaderno de tareas con tu letra',
  description: 'Crea tareas con tu letra, dibujos, símbolos, imágenes y portadas; guárdalas y expórtalas a PDF.',
  openGraph: {
    title: 'Trazo - cuaderno de tareas con tu letra',
    description: 'Escribe, dibuja y organiza tareas completas desde tu tablet.',
    images: [{ url: '/og.png', width: 1536, height: 864, alt: 'Trazo, escritura con pulso' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trazo - cuaderno de tareas con tu letra',
    description: 'Escribe, dibuja y organiza tareas completas desde tu tablet.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${dmSans.variable} ${fraunces.variable}`}>{children}</body></html>;
}
