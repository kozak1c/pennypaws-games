// Penny, the mascot. Tap her and she gives a real high five: a frame animation of her winding up,
// thrusting her paw at you and settling back, with clay shapes thrown off the paw at the slap.
// The frames are drawn on a canvas, each one dissolving into the next, and timed by hand (slow
// wind-up, fast thrust, held slap). The loose clay around her can be picked up and flicked.
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type Shape = 'heart' | 'circle' | 'triangle' | 'square' | 'star';

interface Loose {
  shape: Shape;
  className: string;
}

interface Props {
  /** The rest pose, which is also the animation's last frame. */
  rest: string;
  /** All frames on one sheet, left to right, top to bottom. */
  sheet: string;
  cols: number;
  /** How long each frame is held, in milliseconds. Its length is the number of frames. */
  timing: number[];
  /** The frame (counting from 0) where her paw lands. */
  impact: number;
  /** Width and height of one frame. */
  width: number;
  height: number;
  alt: string;
  clay: Record<Shape, string>;
  loose: Loose[];
  bubbleClass: string;
}

interface Spark {
  id: number;
  shape: Shape;
  x: number;
  y: number;
  spin: number;
}

const LINES = ['High five!', 'Again?', 'Good one!', 'One more?', 'You’re good at this!'];
const SHAPES: Shape[] = ['heart', 'circle', 'triangle', 'square', 'star'];
const BOUNCE = { type: 'spring', stiffness: 420, damping: 14 } as const;

export default function Penny({ rest, sheet, cols, timing, impact, width, height, alt, clay, loose, bubbleClass }: Props) {
  const calm = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useRef<HTMLImageElement>(null);
  const film = useRef<HTMLImageElement | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const playing = useRef(false);
  const nextId = useRef(0);
  const [fives, setFives] = useState(0);
  const [canDrag, setCanDrag] = useState(false);
  const [sparks, setSparks] = useState<Spark[]>([]);

  // Fetch and decode the frames once: shortly after the page settles, or at the first touch.
  const load = () => {
    loading.current ??= (async () => {
      const img = new Image();
      img.src = sheet;
      await img.decode();
      film.current = img;
    })();
    return loading.current;
  };

  useEffect(() => {
    setCanDrag(!calm && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, [calm]);

  useEffect(() => {
    if (calm) return;
    const timer = window.setTimeout(() => void load().catch(() => {}), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm]);

  /** Draw frame `index` dissolving into the next one by `blend` (0 to 1). */
  const draw = (index: number, blend: number) => {
    const ctx = canvas.current?.getContext('2d');
    const img = film.current;
    if (!ctx || !img) return false;
    const put = (frame: number, alpha: number) => {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (frame % cols) * width, Math.floor(frame / cols) * height, width, height, 0, 0, width, height);
    };
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter'; // adds the two frames, so the mix is a true dissolve
    put(index, 1 - blend);
    put(Math.min(index + 1, timing.length - 1), blend);
    return true;
  };

  const burst = () => {
    const thrown = SHAPES.map((shape, i) => {
      const angle = -Math.PI / 2 + (i - 2) * 0.6 + (Math.random() - 0.5) * 0.3;
      const reach = 110 + Math.random() * 80;
      return { id: nextId.current++, shape, x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, spin: (Math.random() - 0.5) * 540 };
    });
    setSparks((old) => [...old, ...thrown]);
  };

  const highFive = async () => {
    if (playing.current) return;
    if (calm) {
      setFives((n) => n + 1);
      return;
    }
    playing.current = true;
    try {
      await load();
    } catch {
      playing.current = false;
      setFives((n) => n + 1);
      return;
    }
    const starts: number[] = [];
    let total = 0;
    for (const ms of timing) {
      starts.push(total);
      total += ms;
    }
    const began = performance.now();
    let landed = false;
    const tick = (now: number) => {
      const t = now - began;
      const img = still.current;
      const view = canvas.current;
      if (!img || !view) {
        playing.current = false;
        return;
      }
      if (t >= total) {
        // The last frame is the rest pose: hand back to the still picture and clear the canvas.
        img.style.opacity = '1';
        view.getContext('2d')?.clearRect(0, 0, width, height);
        playing.current = false;
        return;
      }
      let index = starts.length - 1;
      while (index > 0 && starts[index] > t) index -= 1;
      const along = (t - starts[index]) / timing[index];
      const late = Math.max(0, (along - 0.3) / 0.7);
      const blend = late * late * (3 - 2 * late);
      // The still picture is hidden only once a frame has really been drawn over it.
      if (draw(index, blend)) img.style.opacity = '0';
      if (!landed && index >= impact) {
        landed = true;
        burst();
        setFives((n) => n + 1);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const says = fives === 0 ? 'High five?' : LINES[(fives - 1) % LINES.length];

  return (
    <div className="pointer-events-none relative w-full select-none" style={{ aspectRatio: `${width} / ${height}` }}>
      {/* soft shadow on the table */}
      <span
        aria-hidden="true"
        className="absolute bottom-[0.5%] left-[14%] right-[6%] h-[11%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(30_37_80/0.26),rgb(30_37_80/0))]"
      />
      <img
        ref={still}
        src={rest}
        alt={alt}
        width={width}
        height={height}
        fetchPriority="high"
        draggable={false}
        className="absolute inset-0 block h-full w-full"
      />
      <canvas ref={canvas} width={width} height={height} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
      <button
        type="button"
        onClick={highFive}
        onPointerEnter={() => void load().catch(() => {})}
        aria-describedby="penny-says"
        aria-label="Give Penny a high five"
        className="pointer-events-auto absolute top-[9%] right-[6%] bottom-[1%] left-[16%] cursor-pointer touch-manipulation rounded-[40%] [-webkit-tap-highlight-color:transparent]"
      />

      {/* shapes thrown from her paw at the slap */}
      {sparks.map((spark) => (
        <motion.img
          key={spark.id}
          src={clay[spark.shape]}
          alt=""
          aria-hidden="true"
          className="absolute top-[40%] left-[20%] z-[4] w-[12%] -translate-x-1/2 -translate-y-1/2"
          initial={{ x: 0, y: 0, scale: 0.3, rotate: 0, opacity: 1 }}
          animate={{ x: spark.x, y: [0, spark.y, spark.y + 170], scale: [0.3, 1.15, 0.9], rotate: spark.spin, opacity: [1, 1, 0] }}
          transition={{ duration: 1, ease: 'easeOut', times: [0, 0.4, 1] }}
          onAnimationComplete={() => setSparks((old) => old.filter((s) => s.id !== spark.id))}
        />
      ))}

      <motion.p
        key={says}
        id="penny-says"
        aria-live="polite"
        className={`bubble ${bubbleClass}`}
        initial={calm || fives === 0 ? false : { scale: 0.5, rotate: -14 }}
        animate={{ scale: 1, rotate: -6 }}
        transition={BOUNCE}
      >
        {says}
      </motion.p>

      {/* loose clay to pick up and flick */}
      {loose.map((piece) => (
        <motion.img
          key={piece.shape}
          src={clay[piece.shape]}
          alt=""
          aria-hidden="true"
          draggable={false}
          tabIndex={-1}
          className={`absolute z-[2] ${canDrag ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : ''} ${piece.className}`}
          drag={canDrag}
          dragSnapToOrigin
          dragElastic={0.7}
          dragTransition={{ bounceStiffness: 260, bounceDamping: 12 }}
          whileHover={canDrag ? { scale: 1.15, rotate: 10 } : undefined}
          whileDrag={{ scale: 1.25, zIndex: 5 }}
          whileTap={canDrag ? { scale: 0.92 } : undefined}
          transition={BOUNCE}
        />
      ))}
    </div>
  );
}
