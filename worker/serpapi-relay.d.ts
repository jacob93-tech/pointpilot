declare const relay: {
  fetch(request: Request, env: Record<string, string | undefined>): Promise<Response>;
};
export default relay;
