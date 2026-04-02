import { createElement, Component } from "react";
import { ReactSnapStore } from "./store.js";

type Decorator = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => any;

// TC39 class decorators must return a class, not a plain function.
function wrapAsClass(fc: React.FC<any>): typeof Component {
  class Wrapped extends Component<any> {
    render() {
      return createElement(fc, this.props);
    }
  }
  (Wrapped as any).displayName = fc.displayName;
  return Wrapped;
}

// Structural type to avoid deep type instantiation (TS2589)
// when subclasses are resolved through built .d.ts files.
interface Connectable {
  connect(component: any, config: any): React.FC<any>;
}

export function connect(
  store: Connectable,
  configOrMapper: any,
): Decorator {
  return function (Target: new (...args: any[]) => any, _context: ClassDecoratorContext) {
    return wrapAsClass(store.connect(Target, configOrMapper));
  };
}

export function scoped(config: any): Decorator {
  return function (Target: new (...args: any[]) => any, _context: ClassDecoratorContext) {
    return wrapAsClass(ReactSnapStore.scoped(Target as any, config));
  };
}
