/**
 * Logiciel : Proto3d - gestion des objets
 * 
 * Morteur 3D en javascript
 * Distribue sous la licence LGPL. 
 *
 * @author Laurent MINGUET <webmaster@spipu.net>
 */

// class Objet : permet de gerer un objet 3D. name : nom de l'objet en interne
function Objet(name)
{
    this.PI_180 = Math.PI/180.0;
    
    this.name = name;
    this.pt_ori   = new Array();
    this.pt_3d    = new Array();
    this.pt_2d    = new Array();
    this.pt_nb    = 0;
    this.fc_lst    = new Array();
    this.fc_inf    = new Array();
    this.fc_nb    = 0;
    this.tx_lst    = new Array();
    this.tx_nb    = 0;
    this.is_ready    = false;
    return this;
}

// ajouter un point (x,y,z)
Objet.prototype.ptAdd = function(x, y, z)
{
    x = parseFloat(x); y = parseFloat(y); z = parseFloat(z);
    this.pt_ori.push([x, y, z, 1]);
    this.pt_3d.push([x, y, z, 1]);
    this.pt_nb++;
    return this;
}

// ajouter une liste de points lst, avec possibilite de la recentree [cx,cy,cz], et d'appliquer un facteur de scale
Objet.prototype.ptsAdd = function(lst, center, scale)
{
    if (!center) center = [0., 0., 0.];
    if (!scale) scale = 1.;
    center[0] = parseFloat(center[0]);
    center[1] = parseFloat(center[1]);
    center[2] = parseFloat(center[2]);

    for(var k=0; k<lst.length; k++)
        this.ptAdd(scale*(lst[k][0]-center[0]), scale*(lst[k][1]-center[1]), scale*(lst[k][2]-center[2]));

    return this;
}

// charger une texture. nom_img represente l'url de l'image
Objet.prototype.textureAdd = function(nom_img)
{
    var tx_nb = this.tx_nb;
    var obj = this;
    var img = new Image();
    
    img.onload = function()
    {
        var myCanvas=document.createElement("canvas");
        var myCanvasContext=myCanvas.getContext("2d");
        myCanvas.width    = img.width;
        myCanvas.height    = img.height;
        myCanvasContext.drawImage(img,0,0);
        
        obj.tx_lst[tx_nb] = myCanvasContext.getImageData(0,0,  img.width, img.height);
        myCanvasContext = null;
        myCanvas = null;
    }

    this.tx_lst[tx_nb] = null;
    this.tx_nb++;
    img.src = nom_img;

    return this;
}

// ajouter une face liant les points (pt1,pt2,pt3), de la couleur [R,V,B]
// utilisant eventuellement une texture si elle a ete chargee avec textureAdd
// map represente alors la maniredonc la texture doit etre mappee sur la face
Objet.prototype.fcAdd = function(pt1, pt2, pt3, color, texture, map)
{
    if (!color)        color = [255., 255., 255.];
    if (!texture)    texture = null;
    if (!map)        map = null;
    
    if (texture>this.tx_nb) texture=null;
    if (texture==null) map = null;
    if (map==null) map = [[0, 0], [1, 0], [1, 1]];
    if (color[3])
    {
        alpha = parseFloat(color[3]);
        color[3] = null;
    }
    else
    {
        alpha = 1.;
    }
    
    color[0] = parseFloat(color[0]); color[1] = parseFloat(color[1]); color[2] = parseFloat(color[2]);
    
    map[0][0] = parseFloat(map[0][0]); map[0][1] = 1.-parseFloat(map[0][1]);
    map[1][0] = parseFloat(map[1][0]); map[1][1] = 1.-parseFloat(map[1][1]);
    map[2][0] = parseFloat(map[2][0]); map[2][1] = 1.-parseFloat(map[2][1]);
    if (texture)
    {
        color[0] = parseFloat(color[0])/255.;
        color[1] = parseFloat(color[1])/255.;
        color[2] = parseFloat(color[2])/255.;
    }
    else
    {
        color[0] = parseFloat(color[0]);
        color[1] = parseFloat(color[1]);
        color[2] = parseFloat(color[2]);
    }
    
    if (this.pt_ori[pt1-1]==undefined) alert('pt1 '+pt1+' undefined');
    if (this.pt_ori[pt2-1]==undefined) alert('pt2 '+pt2+' undefined');
    if (this.pt_ori[pt3-1]==undefined) alert('pt3 '+pt3+' undefined');
    
    this.fc_lst.push([pt1-1, pt2-1, pt3-1, color, (texture ? texture-1 : null), map, alpha]);
    this.fc_inf.push([null, null]);
    this.fc_nb++;
    return this;
}

Objet.prototype.fcGetNb = function()
{
    return this.fc_nb;
}

Objet.prototype.ptGetNb = function()
{
    return this.pt_nb;
}

// ajouter une liste de faces, avec la couleur [R,V,B]
Objet.prototype.fcsAdd = function(lst, color)
{
    if (!color) color = [255., 255., 255.];
    
    for(var k=0; k<lst.length; k++)
    {
        for(var l=2; l<lst[k].length; l++)
        {
            this.fcAdd(lst[k][0], lst[k][l-1], lst[k][l], color);
        }
    }

    return this;
}

// charger completement un objet au format ASE. nom_ase represente l'url de l'objet
// avec possibilite de la recentree [cx,cy,cz], d'appliquer un facteur de scale, et de preciser la couleur
Objet.prototype.loadASE = function(nom_ase, center, scale, color)
{
    if (!center) center = [0., 0., 0.];
    if (!scale) scale = 1.;
    
    center[0] = parseFloat(center[0]);
    center[1] = parseFloat(center[1]);
    center[2] = parseFloat(center[2]);
    
    var objet = this;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', nom_ase, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            objet.loadASE_CB(xhr.responseText, center, scale, color);
        }
    };
    xhr.send(null);
    
    return this;
}

// [PRIVATE] NE PAS UTILISER !!!
Objet.prototype.loadASE_CB = function(result, center, scale, color)
{
    result = result.replace(/\s+/gi, ' ');
    result = result.split('GEOMOBJECT');

    var nb_pts = 0;
    var nb = 0;
    var matches =null;
    var nb_obj = result.length;
        
    for(var k=1; k<nb_obj; k++)
    {
        matches = result[k].match(/\*MESH_VERTEX ([\d]+) ([\d\.\-]+) ([\d\.\-]+) ([\d\.\-]+) /g);
        if (!matches) { continue; }
        nb = matches.length;

        for (var i=0; i<nb; i++)
        {
            var val = matches[i].match(/[\d\.\-]+/g);
            this.ptAdd(scale*(parseFloat(val[1])-center[0]), scale*(parseFloat(val[2])-center[1]), scale*(parseFloat(val[3])-center[2]));
        }
        
        var matches = result[k].match(/\*MESH_FACE ([\d]+): A: ([\d]+) B: ([\d]+) C: ([\d]+) /g);
        if (!matches) { nb_pts+= nb; continue; }
        
        for (var i=0; i<matches.length; i++)
        {
            var val = matches[i].match(/[\d]+/g);
            this.fcAdd(nb_pts+parseInt(val[1])+1, nb_pts+parseInt(val[2])+1, nb_pts+parseInt(val[3])+1, color);
        }

        nb_pts+= nb;
    }
    this.ready();
}

//indiquer que la definition de l'objet est finalise et qu'il est utilisable
Objet.prototype.ready = function()
{
    this.is_ready = true;
    return this;
}

//permet de savoir si l'objet est finalise
Objet.prototype.isReady = function()
{
    return this.is_ready;
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.ptTransform = function(m)
{
    for(var x=0; x<this.pt_nb; x++)
    {
        this.pt_3d[x][0] =    m.v[0][0]*this.pt_ori[x][0] + m.v[1][0]*this.pt_ori[x][1] + m.v[2][0]*this.pt_ori[x][2] + m.v[3][0]*this.pt_ori[x][3];
        this.pt_3d[x][1] =    m.v[0][1]*this.pt_ori[x][0] + m.v[1][1]*this.pt_ori[x][1] + m.v[2][1]*this.pt_ori[x][2] + m.v[3][1]*this.pt_ori[x][3];
        this.pt_3d[x][2] =    m.v[0][2]*this.pt_ori[x][0] + m.v[1][2]*this.pt_ori[x][1] + m.v[2][2]*this.pt_ori[x][2] + m.v[3][2]*this.pt_ori[x][3];
        this.pt_3d[x][3] =    m.v[0][3]*this.pt_ori[x][0] + m.v[1][3]*this.pt_ori[x][1] + m.v[2][3]*this.pt_ori[x][2] + m.v[3][3]*this.pt_ori[x][3];
    }
    return this;
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.ptProjection = function(vue)
{
    // recuperation et tracage
    this.pt_2d = new Array();
    for(var k=0; k<this.pt_nb; k++)
    {
        this.pt_2d[k] = new Array();
        this.pt_2d[k][0] = parseInt(vue.calcul_fx*this.pt_3d[k][0]/this.pt_3d[k][2] - vue.calcul_sx);
        this.pt_2d[k][1] = parseInt(vue.calcul_fy*this.pt_3d[k][1]/this.pt_3d[k][2] - vue.calcul_sy);
        this.pt_2d[k][2] = this.pt_3d[k][2];
    }
    return this;
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcDepth = function(pt1, pt2, pt3)
{
    return (pt1[2]+pt2[2]+pt3[2])/3.;
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcNorme = function(v)
{
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcNormal2d = function(pt1, pt2, pt3)
{
    return (pt2[0]-pt1[0])*(pt3[1]-pt1[1]) - (pt2[1]-pt1[1])*(pt3[0]-pt1[0]);
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcNormal = function(pt1, pt2, pt3)
{
    var v1 = [pt2[0]-pt1[0], pt2[1]-pt1[1], pt2[2]-pt1[2]];
    var v2 = [pt3[0]-pt1[0], pt3[1]-pt1[1], pt3[2]-pt1[2]];
    var v = [v1[1]*v2[2] - v1[2]*v2[1], v1[2]*v2[0] - v1[0]*v2[2], v1[0]*v2[1] - v1[1]*v2[0]];
    var n = this.fcNorme(v);
    
    if (n>0)
    {
        v[0] = v[0]/n;
        v[1] = v[1]/n;
        v[2] = v[2]/n;
    }
    return v;
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcMoyenne = function(pt1, pt2, pt3)
{
    return [
                    (pt1[0]+pt2[0]+pt3[0])/3.,
                    (pt1[1]+pt2[1]+pt3[1])/3.,
                    (pt1[2]+pt2[2]+pt3[2])/3.,
                    (pt1[3]+pt2[3]+pt3[3])/3.
            ];
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.ptColor = function(vue, color, pt, normal)
{
    var col = [vue.light_amb[0],vue.light_amb[1],vue.light_amb[2]];

    for(var k=0; k<vue.light_lst.length; k++)
    {
        var temp = vue.light_lst[k].getColorFor(pt, normal);
        col[0]+= temp[0];
        col[1]+= temp[1];
        col[2]+= temp[2];
    }
    if (col[0]<0.) col[0]=0.; if (col[0]>255.) col[0]=255.;
    if (col[1]<0.) col[1]=0.; if (col[1]>255.) col[1]=255.;
    if (col[2]<0.) col[2]=0.; if (col[2]>255.) col[2]=255.;

    col[0] = color[0]*col[0]/255.;
    col[1] = color[1]*col[1]/255.;
    col[2] = color[2]*col[2]/255.;

    return col;
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcMappingPrepare = function(vue, fc, fc_inf)
{
    if (fc_inf[1]>0) return false;
    var col = null;

    col = this.ptColor(vue, fc[3], this.pt_3d[fc[0]], fc_inf[0]);
    this.tmp_pt1[0] = this.pt_2d[fc[0]][0];
    this.tmp_pt1[1] = this.pt_2d[fc[0]][1];
    this.tmp_pt1[2] = this.pt_2d[fc[0]][2];
    this.tmp_pt1[3] = col[0];
    this.tmp_pt1[4] = col[1];
    this.tmp_pt1[5] = col[2];
    this.tmp_pt1[6] = fc[5][0][0];
    this.tmp_pt1[7] = fc[5][0][1];
    
    col = this.ptColor(vue, fc[3], this.pt_3d[fc[1]], fc_inf[0]);
    this.tmp_pt2[0] = this.pt_2d[fc[1]][0];
    this.tmp_pt2[1] = this.pt_2d[fc[1]][1];
    this.tmp_pt2[2] = this.pt_2d[fc[1]][2];
    this.tmp_pt2[3] = col[0];
    this.tmp_pt2[4] = col[1];
    this.tmp_pt2[5] = col[2];
    this.tmp_pt2[6] = fc[5][1][0];
    this.tmp_pt2[7] = fc[5][1][1];

    col = this.ptColor(vue, fc[3], this.pt_3d[fc[2]], fc_inf[0]);
    this.tmp_pt3[0] = this.pt_2d[fc[2]][0];
    this.tmp_pt3[1] = this.pt_2d[fc[2]][1];
    this.tmp_pt3[2] = this.pt_2d[fc[2]][2];
    this.tmp_pt3[3] = col[0];
    this.tmp_pt3[4] = col[1];
    this.tmp_pt3[5] = col[2];
    this.tmp_pt3[6] = fc[5][2][0];
    this.tmp_pt3[7] = fc[5][2][1];
    
    if (this.tmp_pt1[2]<1 && this.tmp_pt2[2]<1 && this.tmp_pt3[2]<1) return false;

    if    (
            (this.tmp_pt1[1]<this.tmp_pt2[1] || (this.tmp_pt1[1]==this.tmp_pt2[1] && this.tmp_pt1[0]<this.tmp_pt2[0])) &&
            (this.tmp_pt1[1]<this.tmp_pt3[1] || (this.tmp_pt1[1]==this.tmp_pt3[1] && this.tmp_pt1[0]<this.tmp_pt3[0]))
        )
    {
        if (this.tmp_pt2[0]>this.tmp_pt3[0])
        {
            var t = this.tmp_pt2; this.tmp_pt2 = this.tmp_pt3; this.tmp_pt3 = t;
        }
    }
    else if    (
            (this.tmp_pt2[1]<this.tmp_pt3[1] || (this.tmp_pt2[1]==this.tmp_pt3[1] && this.tmp_pt2[0]<this.tmp_pt3[0])) &&
            (this.tmp_pt2[1]<this.tmp_pt1[1] || (this.tmp_pt2[1]==this.tmp_pt1[1] && this.tmp_pt2[0]<this.tmp_pt1[0]))
        )
    {
        var t = this.tmp_pt1; this.tmp_pt1 = this.tmp_pt2; this.tmp_pt2 = t;
        if (this.tmp_pt2[0]>this.tmp_pt3[0])
        {
            var t = this.tmp_pt2; this.tmp_pt2 = this.tmp_pt3; this.tmp_pt3 = t;
        }
    }
    else 
    {
        var t = this.tmp_pt1; this.tmp_pt1 = this.tmp_pt3; this.tmp_pt3 = t;
        if (this.tmp_pt2[0]>=this.tmp_pt3[0])
        {
            var t = this.tmp_pt2; this.tmp_pt2 = this.tmp_pt3; this.tmp_pt3 = t;
        }
    }
    
    return true;
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcSort = function (fc1,fc2)
{
    return fc2[1]-fc1[1];
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcDrawFast = function (vue)
{
    for(var k=0; k<this.fc_nb; k++)
    {
        var fc = this.fc_lst[k];
        this.fc_inf[k][0] = k;
        this.fc_inf[k][1] = (this.pt_3d[fc[0]][2] + this.pt_3d[fc[1]][2] + this.pt_3d[fc[2]][2])/3.;
    }
    this.fc_inf.sort(this.fcSort);
        
    vue.scr_ctx.fillStyle = 'rgba(250,250,250,0.7)';
    vue.scr_ctx.strokeStyle = 'rgba(150,150,150,0.7)';

    for(var k=0; k<this.fc_nb; k++)
    {
        var fc = this.fc_lst[this.fc_inf[k][0]];
        vue.scr_ctx.beginPath();
        vue.scr_ctx.moveTo(this.pt_2d[fc[0]][0], this.pt_2d[fc[0]][1]);  
        vue.scr_ctx.lineTo(this.pt_2d[fc[1]][0], this.pt_2d[fc[1]][1]);  
        vue.scr_ctx.lineTo(this.pt_2d[fc[2]][0], this.pt_2d[fc[2]][1]);
        vue.scr_ctx.closePath();
        vue.scr_ctx.fill();
        vue.scr_ctx.stroke();
    }
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcDraw = function (vue)
{
    for(var k=0; k<this.fc_nb; k++)
    {
        var fc = this.fc_lst[k];
        this.fc_inf[k][0] = this.fcNormal(this.pt_3d[fc[0]], this.pt_3d[fc[1]], this.pt_3d[fc[2]]);
        this.fc_inf[k][1] = this.fcNormal2d(this.pt_2d[fc[0]], this.pt_2d[fc[1]], this.pt_2d[fc[2]]);
    }
    
    this.tmp_pt1=new Array();
    this.tmp_pt2=new Array();
    this.tmp_pt3=new Array();

    for(var k=0; k<this.fc_nb; k++)
    {
        if (!this.fcMappingPrepare(vue, this.fc_lst[k], this.fc_inf[k])) continue;

        if (this.fc_lst[k][4]!==null)
            this.fcMappingText(vue, this.fc_lst[k][6], this.tx_lst[this.fc_lst[k][4]]);
        else
            this.fcMappingNoText(vue, this.fc_lst[k][6]);
    }
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.subPixel = function(y)
{
    return (1.+y-Math.ceil(y));
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcMappingNoText = function(vue, alpha)
{
    var ymin = this.tmp_pt1[1];
    var ymax = Math.max(this.tmp_pt2[1], this.tmp_pt3[1]);

    var dt12 = new Array(); var dt23 = new Array(); var dt13 = new Array();
    dt12[0] = this.tmp_pt2[0]-this.tmp_pt1[0]; dt23[0] = this.tmp_pt3[0]-this.tmp_pt2[0]; dt13[0] = this.tmp_pt3[0]-this.tmp_pt1[0];
    dt12[1] = this.tmp_pt2[1]-this.tmp_pt1[1]; dt23[1] = this.tmp_pt3[1]-this.tmp_pt2[1]; dt13[1] = this.tmp_pt3[1]-this.tmp_pt1[1];
    dt12[3] = this.tmp_pt2[3]-this.tmp_pt1[3]; dt23[3] = this.tmp_pt3[3]-this.tmp_pt2[3]; dt13[3] = this.tmp_pt3[3]-this.tmp_pt1[3];
    dt12[4] = this.tmp_pt2[4]-this.tmp_pt1[4]; dt23[4] = this.tmp_pt3[4]-this.tmp_pt2[4]; dt13[4] = this.tmp_pt3[4]-this.tmp_pt1[4];
    dt12[5] = this.tmp_pt2[5]-this.tmp_pt1[5]; dt23[5] = this.tmp_pt3[5]-this.tmp_pt2[5]; dt13[5] = this.tmp_pt3[5]-this.tmp_pt1[5];

    for (var ly=ymin; ly<= ymax; ly++)
    {
        var lt0 = new Array();
        var lt1 = new Array();
        if (ly<=this.tmp_pt2[1])
        {
            var al= (dt12[1]) ? (ly-this.tmp_pt1[1])/dt12[1] : 0;

            lt0[1] = ly; 
            lt0[2] = 1./((1.-al)/this.tmp_pt1[2] + al/this.tmp_pt2[2]);
            lt0[0] = this.tmp_pt1[0] + dt12[0]*al;
            lt0[3] = this.tmp_pt1[3] + dt12[3]*al;
            lt0[4] = this.tmp_pt1[4] + dt12[4]*al;
            lt0[5] = this.tmp_pt1[5] + dt12[5]*al;
        }
        else
        {
            var al= (dt23[1]) ? (ly-this.tmp_pt2[1])/dt23[1] : 0;

            lt0[1] = ly; 
            lt0[2] = 1./((1.-al)/this.tmp_pt2[2] + al/this.tmp_pt3[2]);
            lt0[0] = this.tmp_pt2[0] + dt23[0]*al;
            lt0[3] = this.tmp_pt2[3] + dt23[3]*al;
            lt0[4] = this.tmp_pt2[4] + dt23[4]*al;
            lt0[5] = this.tmp_pt2[5] + dt23[5]*al;
        }
        
        if (ly<this.tmp_pt3[1])
        {
            var al= (dt13[1]) ? (ly-this.tmp_pt1[1])/dt13[1] : 0;

            lt1[1] = ly; 
            lt1[2] = 1./((1.-al)/this.tmp_pt1[2] + al/this.tmp_pt3[2]);
            lt1[0] = this.tmp_pt1[0] + dt13[0]*al;
            lt1[3] = this.tmp_pt1[3] + dt13[3]*al;
            lt1[4] = this.tmp_pt1[4] + dt13[4]*al;
            lt1[5] = this.tmp_pt1[5] + dt13[5]*al;
        }
        else
        {
            var al= (dt23[1]) ? (this.tmp_pt3[1]-ly)/dt23[1] : 0;

            lt1[1] = ly; 
            lt1[2] = 1./((1.-al)/this.tmp_pt3[2] + al/this.tmp_pt2[2]);
            lt1[0] = this.tmp_pt3[0] - dt23[0]*al;
            lt1[3] = this.tmp_pt3[3] - dt23[3]*al;
            lt1[4] = this.tmp_pt3[4] - dt23[4]*al;
            lt1[5] = this.tmp_pt3[5] - dt23[5]*al;
        }

        if (lt0[0]==lt1[0]) continue;

        if (lt0[0]>lt1[0])
        {
            var t = lt0; lt0 = lt1; lt1 = t;
        }

        var xMin = parseInt(lt0[0]);
        var xMax = parseInt(lt1[0]+0.5);
        xMin+= this.subPixel(lt1[1]);
        
        var dt = new Array();
        dt[3] = lt1[3]-lt0[3];
        dt[4] = lt1[4]-lt0[4];
        dt[5] = lt1[5]-lt0[5];
        
        for (var lx=xMin; lx<=xMax; lx++)
        {
            var al = (xMin<xMax) ? (lx-xMin)/(xMax-xMin) : 0.;
            var lz = 1./((1.-al)/lt0[2] + al/lt1[2]);
            
            if (vue.zBufSet(lx, ly, lz))
            {
                var r = parseInt(lt0[3] + dt[3]*al);
                var g = parseInt(lt0[4] + dt[4]*al);
                var b = parseInt(lt0[5] + dt[5]*al);
                var p = 4*(lx+ly*vue.scr_width);
                
                if (alpha<1.)
                {
                    vue.scr_data.data[p+0] = alpha*r+(1-alpha)*vue.scr_data.data[p+0];
                    vue.scr_data.data[p+1] = alpha*g+(1-alpha)*vue.scr_data.data[p+1];
                    vue.scr_data.data[p+2] = alpha*b+(1-alpha)*vue.scr_data.data[p+2];
                    vue.scr_data.data[p+3] = 255;
                }
                else
                {
                    vue.scr_data.data[p+0] = r;
                    vue.scr_data.data[p+1] = g;
                    vue.scr_data.data[p+2] = b;
                    vue.scr_data.data[p+3] = 255;
                }
            }
        }
    }
}

//[PRIVATE] NE PAS UTILISER !!!
Objet.prototype.fcMappingText = function(vue, alpha, text)
{
    var r,g,b,a;
    if (!text) return this.fcMappingNoText(vue);
    
    this.tmp_pt1[6]/= this.tmp_pt1[2]; this.tmp_pt1[7]/= this.tmp_pt1[2]; 
    this.tmp_pt2[6]/= this.tmp_pt2[2]; this.tmp_pt2[7]/= this.tmp_pt2[2];
    this.tmp_pt3[6]/= this.tmp_pt3[2]; this.tmp_pt3[7]/= this.tmp_pt3[2];

    var ymin = this.tmp_pt1[1];
    var ymax = Math.max(this.tmp_pt2[1], this.tmp_pt3[1]);

    var dt12 = new Array(); var dt23 = new Array(); var dt13 = new Array();
    dt12[0] = this.tmp_pt2[0]-this.tmp_pt1[0]; dt23[0] = this.tmp_pt3[0]-this.tmp_pt2[0]; dt13[0] = this.tmp_pt3[0]-this.tmp_pt1[0];
    dt12[1] = this.tmp_pt2[1]-this.tmp_pt1[1]; dt23[1] = this.tmp_pt3[1]-this.tmp_pt2[1]; dt13[1] = this.tmp_pt3[1]-this.tmp_pt1[1];
    dt12[3] = this.tmp_pt2[3]-this.tmp_pt1[3]; dt23[3] = this.tmp_pt3[3]-this.tmp_pt2[3]; dt13[3] = this.tmp_pt3[3]-this.tmp_pt1[3];
    dt12[4] = this.tmp_pt2[4]-this.tmp_pt1[4]; dt23[4] = this.tmp_pt3[4]-this.tmp_pt2[4]; dt13[4] = this.tmp_pt3[4]-this.tmp_pt1[4];
    dt12[5] = this.tmp_pt2[5]-this.tmp_pt1[5]; dt23[5] = this.tmp_pt3[5]-this.tmp_pt2[5]; dt13[5] = this.tmp_pt3[5]-this.tmp_pt1[5];
    dt12[6] = this.tmp_pt2[6]-this.tmp_pt1[6]; dt23[6] = this.tmp_pt3[6]-this.tmp_pt2[6]; dt13[6] = this.tmp_pt3[6]-this.tmp_pt1[6];
    dt12[7] = this.tmp_pt2[7]-this.tmp_pt1[7]; dt23[7] = this.tmp_pt3[7]-this.tmp_pt2[7]; dt13[7] = this.tmp_pt3[7]-this.tmp_pt1[7];
    
    var al, lt0, lt1, lx, ly, lz, xMin, xMax, dt, xt, yt, posi, post;
    
    for (var ly=ymin; ly<= ymax; ly++)
    {
        lt0 = new Array();
        lt1 = new Array();
        
        if (ly<=this.tmp_pt2[1])
        {
            al= (dt12[1]) ? (ly-this.tmp_pt1[1])/dt12[1] : 0;

            lt0[1] = ly; 
            lt0[2] = 1./((1.-al)/this.tmp_pt1[2] + al/this.tmp_pt2[2]);
            lt0[0] = this.tmp_pt1[0] + dt12[0]*al;
            lt0[3] = this.tmp_pt1[3] + dt12[3]*al;
            lt0[4] = this.tmp_pt1[4] + dt12[4]*al;
            lt0[5] = this.tmp_pt1[5] + dt12[5]*al;
            lt0[6] = (this.tmp_pt1[6] + dt12[6]*al)*text.width;
            lt0[7] = (this.tmp_pt1[7] + dt12[7]*al)*text.height;
        }
        else
        {
            al= (dt23[1]) ? (ly-this.tmp_pt2[1])/dt23[1] : 0;

            lt0[1] = ly; 
            lt0[2] = 1./((1.-al)/this.tmp_pt2[2] + al/this.tmp_pt3[2]);
            lt0[0] = this.tmp_pt2[0] + dt23[0]*al;
            lt0[3] = this.tmp_pt2[3] + dt23[3]*al;
            lt0[4] = this.tmp_pt2[4] + dt23[4]*al;
            lt0[5] = this.tmp_pt2[5] + dt23[5]*al;
            lt0[6] = (this.tmp_pt2[6] + dt23[6]*al)*text.width;
            lt0[7] = (this.tmp_pt2[7] + dt23[7]*al)*text.height;
        }
        
        if (ly<this.tmp_pt3[1])
        {
            al= (dt13[1]) ? (ly-this.tmp_pt1[1])/dt13[1] : 0;

            lt1[1] = ly; 
            lt1[2] = 1./((1.-al)/this.tmp_pt1[2] + al/this.tmp_pt3[2]);
            lt1[0] = this.tmp_pt1[0] + dt13[0]*al;
            lt1[3] = this.tmp_pt1[3] + dt13[3]*al;
            lt1[4] = this.tmp_pt1[4] + dt13[4]*al;
            lt1[5] = this.tmp_pt1[5] + dt13[5]*al;
            lt1[6] = (this.tmp_pt1[6] + dt13[6]*al)*text.width;
            lt1[7] = (this.tmp_pt1[7] + dt13[7]*al)*text.height;
        }
        else
        {
            al= (dt23[1]) ? (this.tmp_pt3[1]-ly)/dt23[1] : 0;

            lt1[1] = ly; 
            lt1[2] = 1./((1.-al)/this.tmp_pt3[2] + al/this.tmp_pt2[2]);
            lt1[0] = this.tmp_pt3[0] - dt23[0]*al;
            lt1[3] = this.tmp_pt3[3] - dt23[3]*al;
            lt1[4] = this.tmp_pt3[4] - dt23[4]*al;
            lt1[5] = this.tmp_pt3[5] - dt23[5]*al;
            lt1[6] = (this.tmp_pt3[6] - dt23[6]*al)*text.width;
            lt1[7] = (this.tmp_pt3[7] - dt23[7]*al)*text.height;
        }

        if (lt0[0]==lt1[0]) continue;
        if (lt0[0]>lt1[0]) { t = lt0; lt0 = lt1; lt1 = t; }

        xMin = parseInt(lt0[0]);
        xMax = parseInt(lt1[0]+0.5);

        
        dt = new Array();
        dt[3] = lt1[3]-lt0[3];
        dt[4] = lt1[4]-lt0[4];
        dt[5] = lt1[5]-lt0[5];
        dt[6] = lt1[6]-lt0[6];
        dt[7] = lt1[7]-lt0[7];
        
        for (lx=xMin; lx<=xMax; lx++)
        {
            al = (xMin<xMax) ? (lx-xMin)/(xMax-xMin) : 0;
            lz = 1./((1.-al)/lt0[2] + al/lt1[2]);
            
            if (vue.zBufSet(lx, ly, lz))
            {
                xt = parseInt(lz*(lt0[6] + dt[6]*al))%text.width;     if (xt<0) xt+= text[0];
                yt = parseInt(lz*(lt0[7] + dt[7]*al))%text.height;    if (yt<0) yt+= text[1];
                post = 4*(xt+yt*text.width);
                posi = 4*(lx+ly*vue.scr_width);
                
                r = parseInt((lt0[3] + dt[3]*al)*text.data[post+0]);
                g = parseInt((lt0[4] + dt[4]*al)*text.data[post+1]);
                b = parseInt((lt0[5] + dt[5]*al)*text.data[post+2]);
                a = alpha*parseFloat(text.data[post+3])/255.;
                
                if (a<1.)
                {
                    vue.scr_data.data[posi+0] = a*r + (1-a)*vue.scr_data.data[posi+0];
                    vue.scr_data.data[posi+1] = a*g + (1-a)*vue.scr_data.data[posi+1];
                    vue.scr_data.data[posi+2] = a*b + (1-a)*vue.scr_data.data[posi+2];
                    vue.scr_data.data[posi+3] = a*255 + (1-a)*vue.scr_data.data[posi+3];
                }
                else
                {
                    vue.scr_data.data[posi+0] = r;
                    vue.scr_data.data[posi+1] = g;
                    vue.scr_data.data[posi+2] = b;
                    vue.scr_data.data[posi+3] = 255;
                }
            }
        }
    }
}
