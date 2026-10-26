import { Type, type Static } from "@sinclair/typebox";

const Uuid = Type.String({pattern:"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"});
export const PilotRoleKeySchema = Type.Union([Type.Literal("catalog_admin"), Type.Literal("purchaser"), Type.Literal("technician")]);
export const ManagedUserSchema = Type.Object({
  id: Uuid, companyId: Uuid,
  companyName: Type.String(), name: Type.String(), loginId: Type.String(), email: Type.String(),
  roleKey: Type.String(), status: Type.Union([Type.Literal("active"),Type.Literal("invited"),Type.Literal("disabled"),Type.Literal("suspended")]),
  version: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });
export type ManagedUser = Static<typeof ManagedUserSchema>;
export const AccountDirectorySchema = Type.Object({
  users: Type.Array(ManagedUserSchema, { maxItems: 100 }), nextCursor: Type.Union([Uuid,Type.Null()]),
  roles: Type.Array(Type.Object({key:PilotRoleKeySchema,name:Type.String()}, {additionalProperties:false}),{maxItems:3}),
  companies: Type.Array(Type.Object({id:Uuid,name:Type.String(),type:Type.String()}, {additionalProperties:false}),{maxItems:500}),
}, { additionalProperties: false });
export type AccountDirectory = Static<typeof AccountDirectorySchema>;
export const CreateManagedUserSchema = Type.Object({
  companyId:Uuid, name:Type.String({minLength:1,maxLength:160,pattern:"\\S"}),
  loginId:Type.String({minLength:1,maxLength:320,pattern:"^[^\\s\\x00-\\x1f]+$"}),
  email:Type.String({minLength:3,maxLength:320,pattern:"^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"}), roleKey:PilotRoleKeySchema,
},{additionalProperties:false});
export type CreateManagedUser = Static<typeof CreateManagedUserSchema>;
export const PatchManagedUserSchema = Type.Object({
  version:Type.Integer({minimum:1}), roleKey:Type.Optional(PilotRoleKeySchema),
  status:Type.Optional(Type.Union([Type.Literal("active"),Type.Literal("disabled")])),
},{additionalProperties:false,minProperties:2});
export type PatchManagedUser = Static<typeof PatchManagedUserSchema>;
export const AccountInvitationSchema = Type.Object({token:Type.String({minLength:32,maxLength:256}),expiresAt:Type.String({pattern:String.raw`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`})},{additionalProperties:false});
export const InvitedUserSchema = Type.Object({user:ManagedUserSchema,invitation:AccountInvitationSchema},{additionalProperties:false});
export type InvitedUser = Static<typeof InvitedUserSchema>;
export const CompleteInvitationSchema = Type.Object({token:Type.String({minLength:32,maxLength:256}),newPassword:Type.String({minLength:12,maxLength:512})},{additionalProperties:false});
export const InvitationCompletedSchema = Type.Object({completed:Type.Literal(true)},{additionalProperties:false});
