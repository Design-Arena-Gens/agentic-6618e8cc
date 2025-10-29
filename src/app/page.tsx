'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import {
  clamp,
  lerp,
  pickRandom,
  rectsOverlap,
  type Obstacle,
} from "@/lib/gameUtils";

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 720;
const LANE_COUNT = 3;
const TRACK_WIDTH = 320;
const TRACK_X = (CANVAS_WIDTH - TRACK_WIDTH) / 2;
const LANE_WIDTH = TRACK_WIDTH / LANE_COUNT;
const PLAYER_WIDTH = 68;
const PLAYER_HEIGHT = 120;
const PLAYER_BASE_Y = CANVAS_HEIGHT - PLAYER_HEIGHT - 48;
const OBSTACLE_WIDTH = 68;
const OBSTACLE_HEIGHT = 118;
const BASE_SCROLL_SPEED = 240;
const OBSTACLE_COLORS = [
  "#f72585",
  "#b5179e",
  "#4361ee",
  "#4cc9f0",
  "#ffba08",
] as const;

type PlayerState = {
  lane: number;
  targetLane: number;
  x: number;
  y: number;
  width: number;
  height: number;
  tilt: number;
};

const laneToX = (lane: number) =>
  TRACK_X + lane * LANE_WIDTH + (LANE_WIDTH - PLAYER_WIDTH) / 2;

const createPlayer = (): PlayerState => ({
  lane: 1,
  targetLane: 1,
  x: laneToX(1),
  y: PLAYER_BASE_Y,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  tilt: 0,
});

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
};

type CarDrawable = {
  x: number;
  y: number;
  width: number;
  height: number;
  body: string;
  glow: string;
  tilt?: number;
};

const drawCar = (ctx: CanvasRenderingContext2D, config: CarDrawable) => {
  const { x, y, width, height, body, glow, tilt = 0 } = config;

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.translate(-(x + width / 2), -(y + height / 2));

  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, body);
  gradient.addColorStop(0.5, `${body}dd`);
  gradient.addColorStop(1, `${body}aa`);

  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;
  ctx.fillStyle = gradient;
  drawRoundedRect(ctx, x, y, width, height, 14);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  drawRoundedRect(
    ctx,
    x + width * 0.22,
    y + height * 0.18,
    width * 0.56,
    height * 0.22,
    8,
  );

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  drawRoundedRect(
    ctx,
    x + width * 0.2,
    y + height * 0.52,
    width * 0.6,
    height * 0.28,
    10,
  );

  ctx.restore();
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const playerRef = useRef<PlayerState>(createPlayer());
  const obstaclesRef = useRef<Obstacle[]>([]);
  const laneDashOffsetRef = useRef(0);
  const scoreRef = useRef(0);
  const scoreSnapshotRef = useRef(0);
  const highScoreRef = useRef(0);
  const difficultyRef = useRef(1);
  const spawnTimerRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isRunningRef = useRef(false);

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("neon-racer-highscore");
    if (stored) {
      const value = Number(stored);
      if (!Number.isNaN(value)) {
        setHighScore(value);
        highScoreRef.current = value;
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("neon-racer-highscore", String(highScore));
  }, [highScore]);

  useEffect(() => () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "#030718";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const leftGlow = ctx.createLinearGradient(0, 0, TRACK_X, 0);
    leftGlow.addColorStop(0, "#0f0c29");
    leftGlow.addColorStop(1, "rgba(144, 12, 218, 0.35)");
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, 0, TRACK_X, CANVAS_HEIGHT);

    const rightGlow = ctx.createLinearGradient(
      TRACK_X + TRACK_WIDTH,
      0,
      CANVAS_WIDTH,
      0,
    );
    rightGlow.addColorStop(0, "rgba(13, 110, 253, 0.25)");
    rightGlow.addColorStop(1, "#030718");
    ctx.fillStyle = rightGlow;
    ctx.fillRect(TRACK_X + TRACK_WIDTH, 0, TRACK_X, CANVAS_HEIGHT);

    const roadGradient = ctx.createLinearGradient(
      TRACK_X,
      0,
      TRACK_X + TRACK_WIDTH,
      0,
    );
    roadGradient.addColorStop(0, "#101322");
    roadGradient.addColorStop(0.5, "#090c17");
    roadGradient.addColorStop(1, "#101322");
    ctx.fillStyle = roadGradient;
    ctx.fillRect(TRACK_X, 0, TRACK_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "#ff006e";
    ctx.fillRect(TRACK_X - 12, 0, 6, CANVAS_HEIGHT);
    ctx.fillStyle = "#00f5d4";
    ctx.fillRect(TRACK_X + TRACK_WIDTH + 6, 0, 6, CANVAS_HEIGHT);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 4;
    ctx.setLineDash([32, 28]);
    ctx.lineDashOffset = laneDashOffsetRef.current;
    for (let i = 1; i < LANE_COUNT; i += 1) {
      const x = TRACK_X + i * LANE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, -OBSTACLE_HEIGHT);
      ctx.lineTo(x, CANVAS_HEIGHT + OBSTACLE_HEIGHT);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    obstaclesRef.current.forEach((obstacle) => {
      drawCar(ctx, {
        x: obstacle.x,
        y: obstacle.y,
        width: obstacle.width,
        height: obstacle.height,
        body: obstacle.color,
        glow: `${obstacle.color}aa`,
      });
    });

    const player = playerRef.current;
    drawCar(ctx, {
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height,
      body: "#b8ff39",
      glow: "#8eff59",
      tilt: player.tilt,
    });
  }, []);

  const resetGame = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    setIsGameOver(false);
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    spawnTimerRef.current = 0;
    lastTimeRef.current = 0;
    scoreRef.current = 0;
    scoreSnapshotRef.current = 0;
    laneDashOffsetRef.current = 0;
    difficultyRef.current = 1;
    setDifficulty(1);
    setScore(0);
    obstaclesRef.current = [];
    playerRef.current = createPlayer();
    drawScene();
  }, [drawScene]);

  const spawnObstacle = useCallback(() => {
    const availableLanes: number[] = [];
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const laneBlocked = obstaclesRef.current.some(
        (obstacle) => obstacle.lane === lane && obstacle.y < OBSTACLE_HEIGHT * 1.3,
      );
      if (!laneBlocked) availableLanes.push(lane);
    }

    if (availableLanes.length === 0) return;

    const lane = pickRandom(availableLanes);
    const x = laneToX(lane);
    const color = pickRandom(OBSTACLE_COLORS);

    obstaclesRef.current.push({
      x,
      y: -OBSTACLE_HEIGHT - Math.random() * 160,
      width: OBSTACLE_WIDTH,
      height: OBSTACLE_HEIGHT,
      lane,
      speed: Math.random() * 120,
      color,
    });
  }, []);

  const loop = useCallback(
    function tick(timestamp: number) {
      if (!isRunningRef.current) {
        return;
      }

      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const delta = clamp((timestamp - lastTimeRef.current) / 1000, 0, 0.12);
      lastTimeRef.current = timestamp;

      const baseSpeed = BASE_SCROLL_SPEED + Math.min(240, scoreRef.current * 0.9);

      laneDashOffsetRef.current =
        (laneDashOffsetRef.current - baseSpeed * delta * 0.8) % 120;

      const player = playerRef.current;
      const targetX = laneToX(player.targetLane);
      const eased = lerp(player.x, targetX, clamp(delta * 12, 0, 1));
      const tiltTarget = clamp((targetX - eased) * -0.18, -12, 12);
      player.x = eased;
      player.tilt = lerp(player.tilt, tiltTarget, clamp(delta * 10, 0, 1));
      if (Math.abs(targetX - player.x) < 0.5) {
        player.x = targetX;
        player.lane = player.targetLane;
        player.tilt = 0;
      }

      obstaclesRef.current = obstaclesRef.current
        .map((obstacle) => ({
          ...obstacle,
          y: obstacle.y + (baseSpeed + obstacle.speed) * delta,
        }))
        .filter((obstacle) => obstacle.y < CANVAS_HEIGHT + OBSTACLE_HEIGHT);

      spawnTimerRef.current += delta;
      const spawnInterval = Math.max(0.45, 1.08 - scoreRef.current / 360);
      if (spawnTimerRef.current >= spawnInterval) {
        spawnTimerRef.current = 0;
        spawnObstacle();
      }

      scoreRef.current += (baseSpeed * delta) / 6;
      const roundedScore = Math.floor(scoreRef.current);
      if (roundedScore !== scoreSnapshotRef.current) {
        scoreSnapshotRef.current = roundedScore;
        setScore(roundedScore);
      }

      const playerHitbox = {
        x: player.x + 12,
        y: player.y + 10,
        width: player.width - 24,
        height: player.height - 28,
      };

      const hasCollision = obstaclesRef.current.some((obstacle) =>
        rectsOverlap(playerHitbox, {
          x: obstacle.x + 10,
          y: obstacle.y + 12,
          width: obstacle.width - 20,
          height: obstacle.height - 36,
        }),
      );

      if (hasCollision) {
        isRunningRef.current = false;
        if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        setIsRunning(false);
        setIsGameOver(true);
        if (roundedScore > highScoreRef.current) {
          highScoreRef.current = roundedScore;
          setHighScore(roundedScore);
        }
        return;
      }

      const difficultyLevel = Math.min(10, 1 + Math.floor(scoreRef.current / 140));
      if (difficultyLevel !== difficultyRef.current) {
        difficultyRef.current = difficultyLevel;
        setDifficulty(difficultyLevel);
      }

      if (roundedScore > highScoreRef.current) {
        highScoreRef.current = roundedScore;
        setHighScore(roundedScore);
      }

      drawScene();
      animationRef.current = requestAnimationFrame(tick);
    },
    [drawScene, spawnObstacle],
  );

  const startGame = useCallback(() => {
    resetGame();
    isRunningRef.current = true;
    setIsRunning(true);
    animationRef.current = requestAnimationFrame((timestamp) => {
      lastTimeRef.current = timestamp;
      loop(timestamp);
    });
  }, [loop, resetGame]);

  const movePlayer = useCallback((direction: -1 | 1) => {
    const player = playerRef.current;
    player.targetLane = clamp(player.targetLane + direction, 0, LANE_COUNT - 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === " " || key === "enter") {
        event.preventDefault();
        if (!isRunningRef.current) {
          startGame();
        }
        return;
      }

      if (!isRunningRef.current) {
        if (key === "r") {
          event.preventDefault();
          startGame();
        }
        return;
      }

      if (event.repeat) return;

      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        movePlayer(-1);
      } else if (key === "arrowright" || key === "d") {
        event.preventDefault();
        movePlayer(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [movePlayer, startGame]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  useEffect(() => {
    if (!isRunning) {
      drawScene();
    }
  }, [drawScene, isRunning]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.tag}>futuristic arcade</span>
        <h1>Neon Velocity</h1>
        <p>
          Drift through night-lit streets, dodge rival drivers, and chain
          flawless runs to push your streak higher. Tap the button or press the
          space bar to ignite the engine.
        </p>
      </header>
      <section className={styles.gameShell}>
        <div className={styles.hud}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Score</span>
            <span className={styles.metricValue}>{score.toLocaleString()}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Best</span>
            <span className={styles.metricValue}>{highScore.toLocaleString()}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Speed</span>
            <span className={styles.metricBadge}>Lv. {difficulty}</span>
          </div>
        </div>
        <div className={styles.canvasFrame}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className={styles.canvas}
            aria-label="Neon Velocity racing track"
          />
          {!isRunning && (
            <div className={styles.overlay}>
              <div className={styles.overlayCard} role="status">
                <h2>{isGameOver ? "Impact Detected" : "Ready to Race"}</h2>
                <p>
                  {isGameOver
                    ? `You collided after scoring ${score.toLocaleString()} points.`
                    : "Slide between neon lanes, avoid oncoming cars, and keep your streak alive."}
                </p>
                <button type="button" onClick={startGame} className={styles.primaryButton}>
                  {isGameOver ? "Restart Run" : "Start Run"}
                </button>
                <span className={styles.overlayHint}>or press Space / Enter</span>
              </div>
            </div>
          )}
        </div>
        <footer className={styles.instructions}>
          <div>
            <h3>Controls</h3>
            <ul>
              <li>Left / A — shift one lane left</li>
              <li>Right / D — shift one lane right</li>
              <li>Space or Enter — launch or restart the run</li>
              <li>R — quick restart when the race is stopped</li>
            </ul>
          </div>
          <div>
            <h3>Tips</h3>
            <ul>
              <li>Late dodges add more speed to the incoming traffic.</li>
              <li>Keep the streak alive to climb through higher speed levels.</li>
              <li>Watch the glow on rival cars to predict their lane.</li>
            </ul>
          </div>
        </footer>
      </section>
    </div>
  );
}
