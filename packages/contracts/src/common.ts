import { Type, type Static } from "@sinclair/typebox";

export const ProblemIssueSchema = Type.Object({
  path: Type.Optional(Type.String()),
  code: Type.String(),
  message: Type.String(),
});
export type ProblemIssue = Static<typeof ProblemIssueSchema>;

/** RFC 9457 problem response with safe, stable application extensions. */
export const ProblemDetailsSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer({ minimum: 100, maximum: 599 }),
    detail: Type.Optional(Type.String()),
    instance: Type.Optional(Type.String()),
    code: Type.String(),
    requestId: Type.String(),
    issues: Type.Optional(Type.Array(ProblemIssueSchema)),
  },
  { $id: "ProblemDetails" },
);
export type ProblemDetails = Static<typeof ProblemDetailsSchema>;
