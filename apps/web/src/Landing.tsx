import { ArrowRightIcon, LockIcon, MessageCircleQuestionIcon, QuoteIcon } from 'lucide-react'
import type { ComponentType, JSX, SVGProps } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { SiteHeader } from './SiteHeader.tsx'

// The front page. It says what TrialScout does in one line, plays the demo video, shows the
// three steps and the four promises that keep it careful, then sends people to the search.
// The video, its poster and its captions are our own files (public/demo): no third-party
// player, so nothing here leaves the site.

const STEPS = [
  'Tell us about the cancer',
  'We check every rule of nearby recruiting trials',
  'Take your questions to your doctor',
]

type Icon = ComponentType<SVGProps<SVGSVGElement>>

const PROMISES: { title: string; text: string; icon: Icon }[] = [
  {
    title: 'Every answer quotes the trial',
    text: "Each rule is shown in the trial's own words, next to the answer.",
    icon: QuoteIcon,
  },
  {
    title: 'It says "ask your doctor"',
    text: "When it can't tell, it says so. It never guesses a yes or a no.",
    icon: MessageCircleQuestionIcon,
  },
  {
    title: 'Listed last, not hidden',
    text: 'Trials where something likely rules you out stay on the list, at the end. The AI can be wrong.',
    icon: ArrowRightIcon,
  },
  {
    title: 'Nothing is stored',
    text: 'Your answers stay in your browser tab. No accounts, no tracking.',
    icon: LockIcon,
  },
]

function TryItNow({ className }: { className?: string }): JSX.Element {
  return (
    <Button asChild size="lg" className={className}>
      <a href="/search">
        Try it now
        <ArrowRightIcon aria-hidden="true" />
      </a>
    </Button>
  )
}

export function Landing(): JSX.Element {
  return (
    <>
      <SiteHeader page="home" />
      <main className="mx-auto max-w-5xl space-y-16 px-4 pt-10 pb-20 sm:px-6 sm:pt-14 [overflow-wrap:break-word]">
        <section className="max-w-3xl space-y-5">
          <h1 className="text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl">
            Which cancer trials are worth asking your doctor about?
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Tell us about the cancer in plain words. TrialScout checks every rule of the recruiting
            trials near you on ClinicalTrials.gov, and shows each answer next to the trial's own
            words.
          </p>
          <TryItNow />
        </section>

        <section aria-label="Demo" className="space-y-3">
          {/* No autoplay: motion is kept for loading and expanding. Captions are on. */}
          <video
            aria-label="Demo video"
            className="aspect-video w-full rounded-xl border bg-black shadow-sm"
            controls
            playsInline
            preload="metadata"
            poster="/demo/poster.jpg"
            src="/demo/trialscout-demo.mp4"
          >
            <track default kind="captions" srcLang="en" label="English" src="/demo/captions.vtt" />
          </video>
          <p className="text-muted-foreground text-sm">A two-minute demo with a made-up patient.</p>
        </section>

        <section aria-labelledby="how-title" className="space-y-5">
          <h2 id="how-title" className="font-semibold text-2xl tracking-tight">
            How it works
          </h2>
          {/* The step numbers are drawn by CSS, so each step reads as its words alone. */}
          <ol className="grid gap-4 [counter-reset:step] sm:grid-cols-3" aria-label="How it works">
            {STEPS.map((step) => (
              <li
                key={step}
                className="flex items-start gap-3 [counter-increment:step] before:grid before:size-8 before:shrink-0 before:place-items-center before:rounded-full before:bg-primary-soft before:font-semibold before:text-primary before:content-[counter(step)]"
              >
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="careful-title" className="space-y-5">
          <h2 id="careful-title" className="font-semibold text-2xl tracking-tight">
            Built to be careful
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROMISES.map(({ title, text, icon: Icon }) => (
              <Card key={title} className="gap-2 px-5">
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <h3 className="font-semibold text-lg tracking-tight">{title}</h3>
                <p className="text-muted-foreground">{text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4 border-t pt-10">
          <TryItNow />
          <p className="text-muted-foreground text-sm">
            A demo, not medical advice. No doctor has checked its answers.
          </p>
          <p className="text-sm">
            <a href="/about" className="font-medium">
              About this demo
            </a>
          </p>
        </section>
      </main>
    </>
  )
}
