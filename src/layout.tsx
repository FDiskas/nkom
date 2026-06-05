import type { ReactNode } from "react";

// Shared HTML document shell for every server-rendered page.
export function Layout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <html lang="lt">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
        />
        <link rel="stylesheet" href="/assets/home-page.css" />
      </head>
      <body className="font-display text-foreground min-h-screen">
        {children}
      </body>
    </html>
  );
}
