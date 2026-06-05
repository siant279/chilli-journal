export default function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--nav-bg)',
        padding: '20px 16px 28px',
        textAlign: 'center',
        fontFamily: 'var(--font-label)',
        fontSize: 13,
        color: 'var(--muted)',
      }}
    >
      <p style={{ margin: 0, lineHeight: 1.6 }}>
        Built by{' '}
        <a
          href="https://sianturnercrespo.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--accent)',
            fontWeight: 600,
            textDecoration: 'none',
            borderBottom: '1px solid rgba(74, 124, 89, 0.35)',
          }}
        >
          Sian Turner Crespo
        </a>
      </p>
    </footer>
  )
}
