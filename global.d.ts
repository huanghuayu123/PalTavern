// Ambient types for PalTavern's bundler imports and editor globals.

declare module '*?raw' {
  const fileText: string;
  export default fileText;
}

declare module '*?url' {
  const assetUrl: string;
  export default assetUrl;
}

declare module '*.css' {
  const stylesheetModule: unknown;
  export default stylesheetModule;
}

declare module '*.html' {
  const markup: string;
  export default markup;
}

declare module '*.md' {
  const renderedMarkdown: string;
  export default renderedMarkdown;
}

declare module '*.yaml' {
  const parsedYaml: any;
  export default parsedYaml;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const singleFileComponent: DefineComponent;
  export default singleFileComponent;
}

declare const YAML: typeof import('yaml');

declare const z: typeof import('zod');

declare namespace z {
  export type infer<T> = import('zod').infer<T>;
  export type input<T> = import('zod').input<T>;
  export type output<T> = import('zod').output<T>;
}

declare module 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js' {
  export function registerMvuSchema(
    schema: z.ZodType<Record<string, any>> | (() => z.ZodType<Record<string, any>>),
  ): void;
}
