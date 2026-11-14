import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { financeRouter } from './finance';

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
  }),
  finance: financeRouter,
});

export type AppRouter = typeof appRouter;
export { protectedProcedure, publicProcedure, router };
