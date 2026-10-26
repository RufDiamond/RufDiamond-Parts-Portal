import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { HashOptions } from "argon2";
import { AccountDirectorySchema, CreateManagedUserSchema, PatchManagedUserSchema, InvitedUserSchema, ManagedUserSchema,
  CompleteInvitationSchema, InvitationCompletedSchema, type CreateManagedUser, type PatchManagedUser } from "@rufdiamond/contracts";
import type { Database } from "../../db/client.js";
import type { AppConfig } from "../../config.js";
import { requireCsrf, requireExactOrigin } from "../../plugins/csrf.js";
import { AppError } from "../../plugins/error-handler.js";
import { authenticated, actor, routeSchema } from "../publication/routes.js";
import { createPasswordService } from "../identity/passwords.js";
import { createAccountService } from "./service.js";

export function registerAccountRoutes(app:FastifyInstance,config:AppConfig,database:Database,now:()=>Date,passwordOptions?:HashOptions) {
  const service=createAccountService(database,now,createPasswordService(passwordOptions));
  const onRequest=async(request:FastifyRequest)=>{authenticated(request);if(request.method!=='GET')requireCsrf(request,config);};
  const params=Type.Object({id:Type.String({format:'uuid'})},{additionalProperties:false});
  app.get<{Querystring:{cursor?:string}}>('/api/v1/admin/users',{onRequest,schema:{querystring:Type.Object({cursor:Type.Optional(Type.String({format:'uuid'}))},{additionalProperties:false}),response:{200:routeSchema(AccountDirectorySchema)}}},async(request,reply)=>{
    reply.header('cache-control','private, no-store');return service.list(actor(request),request.query.cursor);
  });
  app.post<{Body:CreateManagedUser}>('/api/v1/admin/users',{onRequest,bodyLimit:16384,schema:{body:routeSchema(CreateManagedUserSchema),response:{201:routeSchema(InvitedUserSchema)}}},async(request,reply)=>{
    reply.header('cache-control','private, no-store');const result=await service.create(actor(request),request.body);reply.code(201);return result;
  });
  app.patch<{Params:{id:string};Body:PatchManagedUser}>('/api/v1/admin/users/:id',{onRequest,bodyLimit:4096,schema:{params,body:routeSchema(PatchManagedUserSchema),response:{200:routeSchema(ManagedUserSchema)}}},async(request,reply)=>{
    reply.header('cache-control','private, no-store');return service.patch(actor(request),request.params.id,request.body);
  });
  app.post<{Params:{id:string};Body:{version:number}}>('/api/v1/admin/users/:id/invitation',{onRequest,bodyLimit:4096,schema:{params,body:Type.Object({version:Type.Integer({minimum:1})},{additionalProperties:false}),response:{200:routeSchema(InvitedUserSchema)}}},async(request,reply)=>{
    reply.header('cache-control','private, no-store');return service.reissue(actor(request),request.params.id,request.body.version);
  });
  const attempts=new Map<string,{at:number;count:number}>();
  app.post<{Body:{token:string;newPassword:string}}>('/api/v1/auth/invitations/complete',{
    bodyLimit:16384,onRequest:async(request)=>{
      requireExactOrigin(request,config);const at=now().getTime();
      for(const [key,entry] of attempts)if(at-entry.at>=60000)attempts.delete(key);
      const entry=attempts.get(request.ip)??{at,count:0};entry.count++;attempts.set(request.ip,entry);
      if(entry.count>30||attempts.size>10000)throw new AppError('RATE_LIMITED',429,'Too many requests. Try again later.');
    },schema:{body:routeSchema(CompleteInvitationSchema),response:{200:routeSchema(InvitationCompletedSchema)}},
  },async(request,reply)=>{reply.header('cache-control','private, no-store');return service.complete(request.body.token,request.body.newPassword,request.requestId);});
}
