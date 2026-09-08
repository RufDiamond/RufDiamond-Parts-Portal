import {
  Type,
  type Static,
  type TSchema,
  type TUnsafe,
} from "@sinclair/typebox";

export const MoneySchema = Type.String({
  pattern: "^(0|[1-9][0-9]{0,11})\\.[0-9]{2}$",
});
export type Money = Static<typeof MoneySchema>;

export const RateSchema = Type.String({
  pattern: "^(0\\.[0-9]{6}|1\\.000000)$",
});
export type Rate = Static<typeof RateSchema>;

export const QuantitySchema = Type.Integer({ minimum: 1, maximum: 9999 });
export type Quantity = Static<typeof QuantitySchema>;

export const NoteSchema = Type.String({ maxLength: 2000 });
export type Note = Static<typeof NoteSchema>;

export const AddressSchema = Type.String({ maxLength: 4000 });
export type Address = Static<typeof AddressSchema>;

export const ReleaseRefSchema = Type.Object(
  {
    modelId: Type.String(),
    releaseId: Type.String(),
    revision: Type.Integer({ minimum: 1 }),
  },
  { $id: "ReleaseRef", additionalProperties: false },
);
export type ReleaseRef = Static<typeof ReleaseRefSchema>;

export const PageSchema = <T extends TSchema>(item: T) =>
  Type.Object(
    {
      items: Type.Array(item),
      nextCursor: Type.Union([Type.String(), Type.Null()]),
      releases: Type.Array(ReleaseRefSchema),
    },
    { additionalProperties: false },
  );
export type Page<T> = Static<ReturnType<typeof PageSchema<TUnsafe<T>>>>;

export const ProblemIssueSchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
    code: Type.String(),
    message: Type.String(),
  },
  { additionalProperties: false },
);
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
  { $id: "ProblemDetails", additionalProperties: false },
);
export type ProblemDetails = Static<typeof ProblemDetailsSchema>;
