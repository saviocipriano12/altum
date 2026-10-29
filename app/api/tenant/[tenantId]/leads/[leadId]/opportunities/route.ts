import { NextResponse } from "next/server";
import { requireRequestUser,RouteAuthError } from "@/app/lib/server/route-auth";
import { TenantAccessError } from "@/lib/server/tenant";
import { listContactOpportunities,createContactOpportunity,OpportunityError } from "@/lib/server/crm/opportunities";
import { InvalidPipelineStageError,TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";

function failure(error:unknown) {
  if(error instanceof RouteAuthError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
  if(error instanceof TenantAccessError) return NextResponse.json({error:error.message,code:error.code},{status:403});
  if(error instanceof OpportunityError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
  if(error instanceof InvalidPipelineStageError) return NextResponse.json({error:error.message,code:"invalid_pipeline_stage"},{status:400});
  if(error instanceof TenantPipelineConfigurationError) return NextResponse.json({error:error.message,code:"pipeline_configuration_invalid"},{status:409});
  if(error instanceof SyntaxError)return NextResponse.json({error:"Dados da oportunidade invalidos."},{status:400});
  console.error("Falha ao processar oportunidades:",error);return NextResponse.json({error:"Nao foi possivel processar as oportunidades."},{status:500});
}
export async function GET(req:Request,context:{params:Promise<{tenantId:string;leadId:string}>}) {
  try {const user=await requireRequestUser(req),{tenantId,leadId}=await context.params;return NextResponse.json({ok:true,...await listContactOpportunities({tenantId,sourceLeadId:leadId,userId:user.uid,userName:user.name})});}
  catch(error){return failure(error);}
}
export async function POST(req:Request,context:{params:Promise<{tenantId:string;leadId:string}>}) {
  try {const user=await requireRequestUser(req),{tenantId,leadId}=await context.params;const result=await createContactOpportunity({tenantId,sourceLeadId:leadId,userId:user.uid,userName:user.name},await req.json());return NextResponse.json({ok:true,...result},{status:result.deduped?200:201});}
  catch(error){return failure(error);}
}
