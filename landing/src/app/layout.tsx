import type { Metadata } from "next";
import { Manrope, Noto_Serif_Display } from "next/font/google";
import "./globals.css";

const display = Noto_Serif_Display({
  variable: "--font-noto-serif-display",
  subsets: ["latin", "greek"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

const body = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "greek"],
});

export const metadata: Metadata = {
  // Absolute base for link previews (og:image); set SITE_URL when building,
  // e.g. SITE_URL=https://example.gr npm run build.
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: "Pure Massage & Spa Experience | Λάρισα",
  description:
    "Θεραπείες μασάζ, προσώπου και premium θεραπείες με φυσικά προϊόντα AHAVA, στο κέντρο της Λάρισας. Ρούσβελτ 63, τηλ. 241 061 4838.",
  icons: {
    icon: [{ url: "/sites/pure/brand/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/sites/pure/brand/apple-touch-icon.png",
  },
  openGraph: {
    title: "Pure Massage & Spa Experience",
    description: "Not just a spa, an experience. Massage, facials and premium treatments in Larissa.",
    images: ["/sites/pure/photos/reception.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="el" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body>{children}</body>
    </html>
  );
}
