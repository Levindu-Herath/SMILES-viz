import Image from "next/image";

const TEAM_MEMBERS = [
  "Gunasinghe Y.K.P.",
  "Gunawardana N.A.W.",
  "Herath H.M.L.T.",
  "Wedamulla W.M.S.M.",
] as const;

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5 shrink-0">
      <rect x="3" y="5" width="18" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5 shrink-0">
      <path
        d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-surface-bg text-text-primary">
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">About Us</h1>
          <p className="mt-1 text-sm text-text-secondary">
            The team and institution behind Molytica.
          </p>
        </div>

        {/* Project description */}
        <section className="rounded-lg border border-surface-border bg-surface-card p-5">
          <p className="text-sm leading-relaxed text-text-secondary">
            Molytica is developed as a Final Year Project by a team of undergraduate students
            from the Department of Electrical and Information Engineering, Faculty of
            Engineering, University of Ruhuna. Following the Computer Engineering
            specialization, our team built Molytica to make cheminformatics research pipelines
            accessible through a modern web interface, bridging the gap between complex
            molecular analysis and practical drug discovery workflows.
          </p>
        </section>

        {/* Team photo */}
        <section className="space-y-2">
          <div className="rounded-lg border border-surface-border bg-surface-card p-2 overflow-hidden">
            <Image
              src="/images/team.jpg"
              alt="Molytica development team"
              width={2000}
              height={1500}
              sizes="(min-width: 768px) 896px, 100vw"
              className="w-full h-auto rounded-md"
              priority
            />
          </div>
          <p className="text-center text-xs text-text-muted">The Molytica Team</p>
        </section>

        {/* Team members */}
        <section>
          <h2 className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider mb-3">
            Team Members
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {TEAM_MEMBERS.map((name) => (
              <div
                key={name}
                className="rounded-lg border border-surface-border bg-surface-card p-5"
              >
                <p className="text-sm font-semibold text-text-primary">{name}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Undergraduate, Computer Engineering
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Supervisor */}
        <section className="rounded-lg border border-surface-border bg-surface-card p-5">
          <h2 className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider mb-3">
            Supervisor
          </h2>
          <p className="text-sm font-semibold text-text-primary">Dr. Kaveen Liyanage</p>
          <p className="mt-1 text-xs text-text-secondary">
            Department of Electrical and Information Engineering, University of Ruhuna
          </p>
        </section>

        {/* Contact */}
        <section className="rounded-lg border border-surface-border bg-surface-card p-5 space-y-4">
          <h2 className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider">
            Contact
          </h2>

          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="text-primary-500">
              <MailIcon />
            </span>
            <a
              href="mailto:sparsegraph23@gmail.com"
              className="text-primary-500 hover:text-primary-600 hover:underline transition-colors duration-150"
            >
              sparsegraph23@gmail.com
            </a>
          </div>

          <div className="flex items-start gap-3 text-sm text-text-secondary">
            <span className="text-primary-500 mt-0.5">
              <MapPinIcon />
            </span>
            <address className="not-italic leading-relaxed">
              Faculty of Engineering,
              <br />
              University of Ruhuna,
              <br />
              Hapugala, Galle,
              <br />
              Sri Lanka.
              <br />
              80000
            </address>
          </div>
        </section>
      </div>
    </main>
  );
}
