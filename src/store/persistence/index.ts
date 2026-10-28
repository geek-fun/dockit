export const createTaskQueue = () => {
  let pending = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = pending.then(task);
    pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
};
