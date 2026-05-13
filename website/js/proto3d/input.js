let InputObject_private = null;

class Input {
    constructor() {
        if (InputObject_private) {
            alert('Input object already exists...');
            return;
        }

        InputObject_private = this;

        this.key_add   = false;
        this.key_lst   = [];

        this.mouse_add = false;
        this.mouse_obj = null;
        this.mouse_x   = null;
        this.mouse_y   = null;
    }

    initKeyboard() {
        if (this.key_add) return;

        this.key_add = true;
        this.key_lst = new Array(256).fill(false);

        document.addEventListener('keydown', InputObject_private.onkeydown, false);
        document.addEventListener('keyup',   InputObject_private.onkeyup,   false);
    }

    initMouse(obj_id) {
        if (this.mouse_add) return;

        this.mouse_add = true;
        this.mouse_obj = obj_id;
        this.mouse_x   = -1;
        this.mouse_y   = -1;

        document.addEventListener('mousemove', InputObject_private.onmousemove, false);
    }

    readKey(k, reset) {
        const v = this.key_lst[k];
        if (reset) this.key_lst[k] = false;
        return v;
    }

    readKeyUp()    { return this.key_lst[38]; }
    readKeyDown()  { return this.key_lst[40]; }
    readKeyLeft()  { return this.key_lst[37]; }
    readKeyRight() { return this.key_lst[39]; }

    readMouseX() { return this.mouse_x; }
    readMouseY() { return this.mouse_y; }

    onkeyup(e) {
        InputObject_private.key_lst[e.keyCode] = false;
        return true;
    }

    onkeydown(e) {
        InputObject_private.key_lst[e.keyCode] = true;
        return true;
    }

    onmousemove(e) {
        const obj = document.getElementById(InputObject_private.mouse_obj);
        if (!obj) return true;

        const x = e.clientX - obj.offsetLeft;
        const y = e.clientY - obj.offsetTop;

        if (x < 0 || y < 0 || x > obj.width || y > obj.height) return true;

        InputObject_private.mouse_x = x;
        InputObject_private.mouse_y = y;
    }
}
