import { diffProperty } from '@dojo/framework/core/decorators/diffProperty';
import { DNode } from '@dojo/framework/core/interfaces';
import { Keys } from '../common/util';
import { reference } from '@dojo/framework/core/diff';
import { I18nMixin, I18nProperties } from '@dojo/framework/core/mixins/I18n';
import { ThemedMixin, ThemedProperties, theme } from '@dojo/framework/core/mixins/Themed';
import Focus from '../meta/Focus';
import { FocusMixin, FocusProperties } from '@dojo/framework/core/mixins/Focus';
import { WidgetBase } from '@dojo/framework/core/WidgetBase';
import { uuid } from '@dojo/framework/core/util';
import { v, w } from '@dojo/framework/core/vdom';

import Icon from '../icon/index';
import Label from '../label/index';
import Listbox from '../listbox/index';
import TextInput, { TextInputProperties } from '../text-input/index';
import commonBundle from '../common/nls/common';

import * as css from '../theme/combobox.m.css';
import * as baseCss from '../common/styles/base.m.css';
import HelperText from '../helper-text/index';

export interface ComboboxProperties extends ThemedProperties, FocusProperties, I18nProperties {
	/** Determines whether the input should be able to be cleared */
	clearable?: boolean;
	/** Prevents user interaction and styles content accordingly */
	disabled?: boolean;
	/** Can be used to get the text label of a result based on the underlying result object */
	getResultLabel?(result: any): DNode;
	/** Can be used to highlight the selected result. Defaults to checking the result label */
	getResultSelected?(result: any): boolean;
	/** Can be used to define a value returned by onValue when a given result is selected. Defaults to getResultLabel */
	getResultValue?(result: any): string;
	/** Displays text at bottom of widget */
	helperText?: string;
	/** TextInput properties to set on the underlying input */
	inputProperties?: TextInputProperties;
	/** Used to determine if an item should be disabled */
	isResultDisabled?(result: any): boolean;
	/** Label to show for this input */
	label?: string;
	labelHidden?: boolean;
	/** Called when the input is blurred */
	onBlur?(): void;
	/** Called when the input is focused */
	onFocus?(): void;
	/** Called when menu visibility changes */
	onMenuChange?(open: boolean): void;
	onOut?(): void;
	onOver?(): void;
	/** Called when results are shown; should be used to set `results` */
	onRequestResults?(): void;
	/** Called when result is selected */
	onResultSelect?(result: any): void;
	onValidate?: (valid: boolean | undefined, message: string) => void;
	/** Called when the value changes */
	onValue?(value: string): void;
	/** Determines whether the result list should open when the input is focused */
	openOnFocus?: boolean;
	/** Prevents user interaction */
	readOnly?: boolean;
	/** Determines if this input is required, styles accordingly */
	required?: boolean;
	/** Results for the current search term; should be set in response to `onRequestResults` */
	results?: any[];
	/** Determines if this input is valid */
	valid?: { valid?: boolean; message?: string } | boolean;
	/** Value to set on the input */
	value?: string;
	/** Optional id string for the combobox, set on the text input */
	widgetId?: string;
}

// Enum used when traversing items using arrow keys
export enum Operation {
	increase = 1,
	decrease = -1
}

@theme(css)
@diffProperty('results', reference)
export class ComboBox extends I18nMixin(ThemedMixin(FocusMixin(WidgetBase)))<ComboboxProperties> {
	private _activeIndex = 0;
	private _ignoreBlur: boolean | undefined;
	private _idBase = uuid();
	private _menuHasVisualFocus = false;
	private _open: boolean | undefined;
	private _wasOpen: boolean | undefined;

	private _closeMenu() {
		this._open = false;
		this.invalidate();
	}

	private _getMenuId() {
		return `${this._idBase}-menu`;
	}

	private _getResultLabel(result: any) {
		const { getResultLabel } = this.properties;

		return getResultLabel ? getResultLabel(result) : `${result}`;
	}

	private _getResultSelected(result: any) {
		const { getResultSelected, value } = this.properties;

		return getResultSelected
			? getResultSelected(result)
			: this._getResultLabel(result) === value;
	}

	private _getResultValue(result: any) {
		const { getResultValue = this.properties.getResultLabel } = this.properties;

		return getResultValue ? `${getResultValue(result)}` : `${result}`;
	}

	private _getResultId(result: any, index: number) {
		return `${this._idBase}-result${index}`;
	}

	private _onArrowClick(event: MouseEvent) {
		event.stopPropagation();
		const { disabled, readOnly } = this.properties;

		if (!disabled && !readOnly) {
			this.focus();
			this._openMenu();
		}
	}

	private _onClearClick(event: MouseEvent) {
		event.stopPropagation();
		const { onValue } = this.properties;

		this.focus();
		this.invalidate();
		onValue && onValue('');
	}

	private _onInputValue(value: string) {
		const { disabled, readOnly, onValue } = this.properties;

		onValue && onValue(value);
		!disabled && !readOnly && this._openMenu();
	}

	private _onInputBlur() {
		const { onBlur } = this.properties;

		if (this._ignoreBlur) {
			this._ignoreBlur = false;
			return;
		}

		onBlur && onBlur();
		this._closeMenu();
	}

	private _onInputFocus() {
		const { disabled, readOnly, onFocus, openOnFocus } = this.properties;

		onFocus && onFocus();
		!disabled && !readOnly && openOnFocus && this._openMenu();
	}

	private _onInputKey(key: number, preventDefault: () => void) {
		const {
			disabled,
			isResultDisabled = () => false,
			readOnly,
			results = []
		} = this.properties;
		this._menuHasVisualFocus = true;

		switch (key) {
			case Keys.Up:
				preventDefault();
				this._moveActiveIndex(Operation.decrease);
				break;
			case Keys.Down:
				preventDefault();
				if (!this._open && !disabled && !readOnly) {
					this._openMenu();
				} else if (this._open) {
					this._moveActiveIndex(Operation.increase);
				}
				break;
			case Keys.Escape:
				this._open && this._closeMenu();
				break;
			case Keys.Enter:
			case Keys.Space:
				if (this._open && results.length > 0) {
					if (isResultDisabled(results[this._activeIndex])) {
						return;
					}
					this._selectIndex(this._activeIndex);
				}
				break;
			case Keys.Home:
				this._activeIndex = 0;
				this.invalidate();
				break;
			case Keys.End:
				this._activeIndex = results.length - 1;
				this.invalidate();
				break;
		}
	}

	private _onMenuChange() {
		const { onMenuChange } = this.properties;

		if (!onMenuChange) {
			return;
		}

		this._open && !this._wasOpen && onMenuChange(true);
		!this._open && this._wasOpen && onMenuChange(false);
	}

	private _onResultHover(): void {
		this._menuHasVisualFocus = false;
		this.invalidate();
	}

	private _onResultMouseDown(event: MouseEvent) {
		event.stopPropagation();
		// Maintain underlying input focus on next render
		this._ignoreBlur = true;
	}

	private _openMenu() {
		const { onRequestResults } = this.properties;

		this._activeIndex = 0;
		this._open = true;
		onRequestResults && onRequestResults();
		this.invalidate();
	}

	private _selectIndex(index: number) {
		const { onValue, onResultSelect, results = [] } = this.properties;

		this.focus();
		this._closeMenu();
		onResultSelect && onResultSelect(results[index]);
		onValue && onValue(this._getResultValue(results[index]));
	}

	private _moveActiveIndex(operation: Operation) {
		const { results = [] } = this.properties;

		if (results.length === 0) {
			this._activeIndex = 0;
			this.invalidate();
			return;
		}

		const total = results.length;
		const nextIndex = (this._activeIndex + operation + total) % total;

		this._activeIndex = nextIndex;
		this.invalidate();
	}

	protected get validity() {
		const { valid = { valid: undefined, message: undefined } } = this.properties;

		if (typeof valid === 'boolean') {
			return { valid, message: undefined };
		}

		return {
			valid: valid.valid,
			message: valid.message
		};
	}

	protected renderInput(results: any[]): DNode {
		const {
			classes,
			disabled,
			widgetId = this._idBase,
			inputProperties = {},
			readOnly,
			required,
			value = '',
			theme,
			onValidate
		} = this.properties;

		const { valid } = this.validity;

		return w(TextInput, {
			...inputProperties,
			key: 'textinput',
			classes,
			aria: {
				activedescendant: this._open
					? this._getResultId(results[this._activeIndex], this._activeIndex)
					: null,
				autocomplete: 'list'
			},
			valid,
			disabled,
			widgetId,
			focus: this.shouldFocus,
			onBlur: this._onInputBlur,
			onFocus: this._onInputFocus,
			onValue: this._onInputValue,
			onKeyDown: this._onInputKey,
			onValidate,
			readOnly,
			required,
			theme,
			value
		});
	}

	protected renderClearButton(messages: typeof commonBundle.messages): DNode {
		const { disabled, label = '', readOnly, theme, classes } = this.properties;

		return v(
			'button',
			{
				key: 'clear',
				'aria-hidden': 'true',
				classes: this.theme(css.clear),
				disabled: disabled || readOnly,
				tabIndex: -1,
				type: 'button',
				onclick: this._onClearClick
			},
			[
				v('span', { classes: baseCss.visuallyHidden }, [`${messages.clear} ${label}`]),
				w(Icon, { type: 'closeIcon', theme, classes })
			]
		);
	}

	protected renderMenuButton(messages: typeof commonBundle.messages): DNode {
		const { disabled, label = '', readOnly, theme, classes } = this.properties;

		return v(
			'button',
			{
				key: 'trigger',
				'aria-hidden': 'true',
				classes: this.theme(css.trigger),
				disabled: disabled || readOnly,
				tabIndex: -1,
				type: 'button',
				onclick: this._onArrowClick
			},
			[
				v('span', { classes: baseCss.visuallyHidden }, [`${messages.open} ${label}`]),
				w(Icon, { type: 'downIcon', theme, classes })
			]
		);
	}

	protected renderMenu(results: any[]): DNode {
		const { theme, isResultDisabled, classes } = this.properties;

		if (results.length === 0 || !this._open) {
			return null;
		}

		return v(
			'div',
			{
				key: 'dropdown',
				classes: this.theme(css.dropdown),
				onmouseover: this._onResultHover,
				onmousedown: this._onResultMouseDown
			},
			[
				w(Listbox, {
					key: 'listbox',
					classes,
					activeIndex: this._activeIndex,
					widgetId: this._getMenuId(),
					visualFocus: this._menuHasVisualFocus,
					optionData: results,
					tabIndex: -1,
					getOptionDisabled: isResultDisabled,
					getOptionId: this._getResultId,
					getOptionLabel: this._getResultLabel,
					getOptionSelected: this._getResultSelected,
					onActiveIndexChange: (index: number) => {
						this._activeIndex = index;
						this.invalidate();
					},
					onOptionSelect: (option: any, index: number) => {
						this._selectIndex(index);
					},
					theme
				})
			]
		);
	}

	render(): DNode {
		const {
			clearable = false,
			widgetId = this._idBase,
			label,
			readOnly,
			required,
			disabled,
			labelHidden,
			results = [],
			theme,
			classes,
			helperText,
			onOver,
			onOut
		} = this.properties;

		const { valid, message } = this.validity;

		const { messages } = this.localizeBundle(commonBundle);
		const focus = this.meta(Focus).get('root');

		const menu = this.renderMenu(results);
		this._onMenuChange();

		if (results.length === 0 && this._open === true) {
			this._open = false;
			this.invalidate();
		}

		const rootClasses = [
			css.root,
			this._open ? css.open : null,
			clearable ? css.clearable : null,
			focus.containsFocus ? css.focused : null,
			valid === false ? css.invalid : null,
			valid === true ? css.valid : null
		];

		this._wasOpen = this._open;

		const controls = [
			label
				? w(
						Label,
						{
							key: 'label',
							theme,
							classes,
							disabled,
							focused: focus.containsFocus,
							valid,
							readOnly,
							required,
							hidden: labelHidden,
							forId: widgetId
						},
						[label]
				  )
				: null,
			v(
				'div',
				{
					'aria-expanded': this._open ? 'true' : 'false',
					'aria-haspopup': 'listbox',
					'aria-owns': this._open ? this._getMenuId() : null,
					classes: this.theme(css.controls),
					role: 'combobox',
					onpointerenter: () => {
						onOver && onOver();
					},
					onpointerleave: () => {
						onOut && onOut();
					}
				},
				[
					this.renderInput(results),
					clearable ? this.renderClearButton(messages) : null,
					this.renderMenuButton(messages)
				]
			),
			!this._open &&
				w(HelperText, {
					text: valid ? helperText : message,
					valid
				}),
			menu
		];

		return v(
			'div',
			{
				classes: this.theme(rootClasses),
				key: 'root'
			},
			controls
		);
	}
}

export default ComboBox;
