// /web/lib/apiError.ts
export type ApiError = {
  code: string;
  message: string;
  details?: any;
  requestId?: string;
};

export function jsonError(
  code: string,
  message: string,
  status = 500,
  details?: any,
  requestId?: string,
) {
  return Response.json(
    { error: { code, message, details, requestId } satisfies ApiError },
    { status },
  );
}
