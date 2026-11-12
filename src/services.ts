import { SaveStore } from './core/SaveStore';
import { createStorage } from './platform/storage';

export const save = new SaveStore(createStorage());
