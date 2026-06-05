export function SiteFooter() {
  return (
    <footer className="mt-8 pb-3 text-center space-x-4">
      {[
        { href: "/", label: "Pagrindinis" },
        { href: "/apie", label: "Apie projektą" },
        { href: "/health", label: "API diagnostika" },
        { href: "https://github.com/FDiskas/nkom", label: "GitHub" },
      ].map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
        >
          {link.label}
        </a>
      ))}
    </footer>
  );
}