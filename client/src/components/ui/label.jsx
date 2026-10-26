import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils.js';

export function Label({ className, ...props }) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium text-text', className)} {...props} />;
}
