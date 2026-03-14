import pino from "pino";

const loggerOptions: pino.LoggerOptions = {
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "lighter-bot" },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  redact: {
    paths: ["*.apiKey", "*.privateKey", "*.secret", "*.password", "*.token"],
    censor: "[REDACTED]",
  },
};

if (process.env["LOG_PRETTY"] === "true") {
  loggerOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
}

export const logger = pino(loggerOptions);

export function createChildLogger(context: Record<string, string>) {
  return logger.child(context);
}

export type Logger = typeof logger;
