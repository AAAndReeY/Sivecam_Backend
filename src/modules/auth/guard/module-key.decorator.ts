import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'module_key';
export const MODULE_OP  = 'module_op';
export const LAYER_KEY  = 'layer_key';

export type ModuleOperation = 'read' | 'create' | 'edit' | 'delete';

export const ModuleKey = (key: string)         => SetMetadata(MODULE_KEY, key);
export const ModuleOp  = (op: ModuleOperation) => SetMetadata(MODULE_OP,  op);
export const LayerKey  = (key: string)         => SetMetadata(LAYER_KEY,  key);
