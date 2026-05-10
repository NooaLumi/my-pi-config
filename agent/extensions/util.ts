export enum Icon {
   Cogwheel,
   Record,
   Search,
}

export function getIcon(type: Icon): string {
   switch (type) {
      case Icon.Cogwheel:
         return "\uf013 ";
      case Icon.Record:
         return "\udb81\udc4a ";
      case Icon.Search:
         return "\udb81\udf0f ";
   }
}
