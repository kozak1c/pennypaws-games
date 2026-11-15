// A door on the home page: a glossy block that tilts toward the pointer, catches the light,
// squishes when pressed, and lifts the real things inside it (phones, pages, paperbacks).
import { useEffect, useRef, type ReactNode } from 'react';
import {
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';

export interface Art {
  src: string;
  kind: 'phone' | 'sheet' | 'cover' | 'appicon';
  /** Where it sits in the door: Tailwind position, width and rotation classes. */
  className: string;
  /** How far it rises when the door is hovered or comes into view, in percent of its own height. */
  lift?: number;
}

/** A picture in a row along the bottom of a wide door. */
export interface Strip {
  src: string;
  alt: string;
  className: string;
  lift: number;
  turn: number;
}

interface Props {
  href: string;
  tone: 'sky' | 'heart' | 'sun' | 'leaf';
  label: string;
  sub: string;
  subClass?: string;
  art?: Art[];
  strip?: Strip[];
  stripClass?: string;
  className?: string;
  children?: ReactNode;
}

function Thumb({ item, open }: { item: Strip; open: MotionValue<number> }) {
  const y = useTransform(open, [0, 1], ['0%', `-${item.lift}%`]);
  const rotate = useTransform(open, [0, 1], [0, item.turn]);
  return (
    <motion.img
      src={item.src}
      alt={item.alt}
      decoding="async"
      className={item.className}
      style={{ y, rotate, transformOrigin: '50% 100%' }}
    />
  );
}

function Thing({ art, open }: { art: Art; open: MotionValue<number> }) {
  const lift = art.lift ?? 10;
  const y = useTransform(open, [0, 1], ['0%', `-${lift}%`]);
  const scale = useTransform(open, [0, 1], [1, 1.04]);
  return (
    <motion.span className={`door__art ${art.kind} ${art.className}`} style={{ y, scale }}>
      <img src={art.src} alt="" decoding="async" />
    </motion.span>
  );
}

export default function Door({
  href,
  tone,
  label,
  sub,
  subClass = '',
  art = [],
  strip = [],
  stripClass = '',
  className = '',
  children,
}: Props) {
  const calm = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const seen = useInView(ref, { amount: 0.6, once: true });

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);
  const soft = { stiffness: 180, damping: 16 };
  const sx = useSpring(px, soft);
  const sy = useSpring(py, soft);
  const lifted = useSpring(hover, { stiffness: 240, damping: 13 });

  const rotateY = useTransform(sx, [0, 1], [-7, 7]);
  const rotateX = useTransform(sy, [0, 1], [6, -6]);
  // The things inside rise a little the first time the door is seen; hovering lifts them the rest of the way.
  const rest = useSpring(0, { stiffness: 120, damping: 11 });
  useEffect(() => {
    if (seen) rest.set(1);
  }, [seen, rest]);
  const open = useTransform<number, number>([lifted, rest], ([up, shown]) => shown * 0.35 + up * 0.65);
  const gx = useTransform(sx, (v) => `${v * 100}%`);
  const gy = useTransform(sy, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(18rem circle at ${gx} ${gy}, rgb(255 255 255 / 0.34), rgb(255 255 255 / 0) 65%)`;

  const move = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (calm || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
    hover.set(1);
  };
  const leave = () => {
    px.set(0.5);
    py.set(0.5);
    hover.set(0);
  };

  return (
    <div className={`h-full [perspective:60rem] ${className}`}>
      <motion.a
        ref={ref}
        href={href}
        className={`door door--${tone}`}
        style={calm ? undefined : { rotateX, rotateY }}
        whileTap={calm ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        onPointerMove={move}
        onPointerLeave={leave}
        onFocus={() => hover.set(1)}
        onBlur={() => hover.set(0)}
      >
        <motion.span aria-hidden="true" className="door__glare" style={{ background: glare, opacity: lifted }} />
        <span className="door__label">{label}</span>
        <span className={`door__sub ${subClass}`}>{sub}</span>
        {art.map((item) => (
          <Thing key={item.src} art={item} open={open} />
        ))}
        {strip.length > 0 && (
          <span className={stripClass}>
            {strip.map((item) => (
              <Thumb key={item.src} item={item} open={open} />
            ))}
          </span>
        )}
        {children}
      </motion.a>
    </div>
  );
}
