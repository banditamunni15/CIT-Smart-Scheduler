const error = (message: string, cause: unknown): void => {
  console.error(
    message,
    cause instanceof Error ? (cause.stack ?? cause) : cause,
  );
};

const info = (message: string): void => {
  console.info(message);
};

const logger = { error, info };

export default logger;
