import { createElement, Component } from "react";

type Decorator = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => any;

// Structural type for the store parameter to avoid deep type instantiation (TS2589)
// when subclasses are resolved through built .d.ts files.
interface Connectable {
  connect(component: any, config: any): React.FC<any>;
}

export function connect(
  store: Connectable,
  configOrMapper: any,
): Decorator {
  return function (Target: new (...args: any[]) => any, _context: ClassDecoratorContext) {
    const ConnectedFC = store.connect(Target, configOrMapper);

    // TC39 class decorators must return a class, not a plain function.
    class Connected extends Component<any> {
      render() {
        return createElement(ConnectedFC, this.props);
      }
    }

    (Connected as any).displayName = ConnectedFC.displayName;

    return Connected;
  };
}
