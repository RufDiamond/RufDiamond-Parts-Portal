import { Type } from "@sinclair/typebox";
import { MeResponseSchema } from "@rufdiamond/contracts";

export const SignInBodySchema = Type.Object({
  loginId: Type.String({ minLength: 1, maxLength: 320 }),
  password: Type.String({ minLength: 1, maxLength: 512 }),
}, { additionalProperties: false });

export const SignInResponseSchema = Type.Object({
  csrfToken: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const MeRouteResponseSchema = MeResponseSchema;

export const SignOutBodySchema = Type.Object({
  allSessions: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

export const SignedOutResponseSchema = Type.Object({ signedOut: Type.Literal(true) }, { additionalProperties: false });

export const PasswordResetRequestBodySchema = Type.Object({
  loginId: Type.String({ minLength: 1, maxLength: 320 }),
}, { additionalProperties: false });
export const PasswordResetRequestedResponseSchema = Type.Object({ accepted: Type.Literal(true) }, { additionalProperties: false });

export const PasswordResetCompleteBodySchema = Type.Object({
  resetToken: Type.String({ minLength: 32, maxLength: 256 }),
  newPassword: Type.String({ minLength: 12, maxLength: 512 }),
}, { additionalProperties: false });
export const PasswordResetCompleteResponseSchema = Type.Object({ completed: Type.Literal(true) }, { additionalProperties: false });
